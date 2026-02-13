import { createHash } from "node:crypto";
import type { ICache } from "../core/interfaces/cache.interface.js";
import type { LLMResponse } from "../core/types/llm-response.js";
import { getProvider } from "../providers/index.js";

const CACHE_TTL_SECONDS = 3600; // 1 hour (non-streaming)
const STREAM_CACHE_TTL_SECONDS = 60; // for testing (streaming)

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

function cacheKeyForPrompt(prompt: string): string {
  const normalized = prompt.trim().toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

const STREAM_CHUNK_DELAY_MS = 20;

async function* simulateStreamFromCached(cached: string): AsyncGenerator<string, void, unknown> {
  const parts = cached.split(/(\s+)/); // keep spaces with following word
  for (const part of parts) {
    if (part.length > 0) {
      yield part;
      await new Promise((r) => setTimeout(r, STREAM_CHUNK_DELAY_MS));
    }
  }
}

export type Logger = {
  info: (msgOrObj: string | object, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
};

const PROMPT_TRUNCATE_LEN = 50;

function truncatePrompt(prompt: string): string {
  const s = prompt.trim();
  return s.length <= PROMPT_TRUNCATE_LEN
    ? s
    : s.slice(0, PROMPT_TRUNCATE_LEN) + "...";
}

export type RequestLogContext = {
  requestId: string;
  prompt: string;
  startTime: number;
};

function logRequestOutcome(
  logger: Logger,
  context: RequestLogContext,
  meta: {
    provider: string;
    cacheHit: boolean;
    status: "success" | "fallback_triggered";
  }
): void {
  const latencyMs = Date.now() - context.startTime;
  logger.info({
    requestId: context.requestId,
    prompt: truncatePrompt(context.prompt),
    provider: meta.provider,
    cacheHit: meta.cacheHit,
    latencyMs,
    status: meta.status,
  });
}

export class LLMGatewayService {
  constructor(
    private readonly logger: Logger,
    private readonly cache: ICache
  ) {}

  async *streamWithFallback(
    prompt: string,
    context?: RequestLogContext
  ): AsyncGenerator<string, void, unknown> {
    const key = cacheKeyForPrompt(prompt);
    const cached = await this.cache.get(key);

    if (cached !== null) {
      this.logger.info("Cache HIT");
      yield* simulateStreamFromCached(cached);
      if (context) {
        logRequestOutcome(this.logger, context, {
          provider: "cache",
          cacheHit: true,
          status: "success",
        });
      }
      return;
    }

    this.logger.info("Cache MISS");

    const openai = getProvider("openai");
    const gemini = getProvider("gemini");

    let stream: AsyncGenerator<string, void, unknown>;
    let provider: "openai" | "gemini" = "openai";
    let usedFallback = false;

    if (openai) {
      try {
        stream = openai.stream(prompt);
      } catch (err) {
        this.logger.warn(
          "OpenAI stream failed, falling back to Gemini",
          err instanceof Error ? err.message : err
        );
        usedFallback = true;
        if (gemini) {
          stream = gemini.stream(prompt);
          provider = "gemini";
        } else {
          throw new Error(
            "No LLM provider available for streaming. Configure OPENAI_API_KEY and/or GEMINI_API_KEY."
          );
        }
      }
    } else {
      this.logger.warn("OpenAI provider not configured, using Gemini");
      if (gemini) {
        stream = gemini.stream(prompt);
        provider = "gemini";
      } else {
        throw new Error(
          "No LLM provider available for streaming. Configure OPENAI_API_KEY and/or GEMINI_API_KEY."
        );
      }
    }

    let fullResponse = "";
    try {
      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }
    } catch (err) {
      if (gemini) {
        this.logger.warn(
          "Primary stream failed, falling back to Gemini",
          err instanceof Error ? err.message : err
        );
        usedFallback = true;
        provider = "gemini";
        stream = gemini.stream(prompt);
        fullResponse = "";
        for await (const chunk of stream) {
          fullResponse += chunk;
          yield chunk;
        }
      } else {
        throw err;
      }
    }

    await this.cache.set(key, fullResponse, STREAM_CACHE_TTL_SECONDS);

    if (context) {
      logRequestOutcome(this.logger, context, {
        provider,
        cacheHit: false,
        status: usedFallback ? "fallback_triggered" : "success",
      });
    }
  }

  async executeWithFallback(prompt: string): Promise<LLMResponse> {
    const key = hashPrompt(prompt);
    const cached = await this.cache.get(key);
    if (cached !== null) {
      const parsed = JSON.parse(cached) as LLMResponse;
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
        cached: true,
      };
    }

    const openai = getProvider("openai");
    const gemini = getProvider("gemini");

    let result: LLMResponse;
    if (openai) {
      try {
        result = await openai.generate(prompt);
      } catch (err) {
        this.logger.warn(
          "OpenAI provider failed, falling back to Gemini",
          err instanceof Error ? err.message : err
        );
        if (gemini) {
          result = await gemini.generate(prompt);
        } else {
          throw new Error(
            "No LLM provider available. Configure OPENAI_API_KEY and/or GEMINI_API_KEY."
          );
        }
      }
    } else {
      this.logger.warn("OpenAI provider not configured, using Gemini");
      if (gemini) {
        result = await gemini.generate(prompt);
      } else {
        throw new Error(
          "No LLM provider available. Configure OPENAI_API_KEY and/or GEMINI_API_KEY."
        );
      }
    }

    await this.cache.set(key, JSON.stringify(result), CACHE_TTL_SECONDS);
    return result;
  }
}
