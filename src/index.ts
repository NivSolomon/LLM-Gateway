import "dotenv/config";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import pino from "pino";
import { MemoryCache } from "./infrastructure/memory-cache.js";
import {
  requestLoggerMiddleware,
  logChatRequest,
} from "./middleware/request-logger.middleware.js";
import { LLMGatewayService } from "./services/llm-gateway.service.js";

const usePrettyLog =
  process.env.LOG_PRETTY === "1" || process.env.NODE_ENV === "development";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(usePrettyLog && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Avoid logging full request/response bodies (potential PII)
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

const fastify = Fastify({ loggerInstance: logger });
const cache = new MemoryCache();
const gatewayService = new LLMGatewayService(fastify.log, cache);

async function setup(): Promise<void> {
  await fastify.register(rateLimit, {
    max: 5,
    timeWindow: 60_000, // 1 minute
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded, retry after ${context.after}`,
    }),
  });
  await fastify.register(requestLoggerMiddleware);
}

const chatBodySchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string", minLength: 1 },
  },
} as const;

function truncatePrompt(prompt: string, maxLen = 50): string {
  const s = prompt.trim();
  return s.length <= maxLen ? s : s.slice(0, maxLen) + "...";
}

fastify.post<{ Body: { message: string } }>(
  "/api/chat",
  { schema: { body: chatBodySchema } },
  async (request, reply) => {
    const { message } = request.body;
    const startTime = Date.now();

    try {
      const result = await gatewayService.executeWithFallback(message);
      logChatRequest(request, result);
      request.log.info({
        requestId: request.id,
        prompt: truncatePrompt(message),
        provider: result.provider,
        cacheHit: result.cached ?? false,
        latencyMs: Date.now() - startTime,
        status: "success",
      });
      return reply.send(result);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: "Gateway Error",
        message: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  }
);

async function handleStream(
  request: FastifyRequest,
  reply: FastifyReply,
  message: string
): Promise<void> {
  const startTime = Date.now();
  const context = {
    requestId: request.id,
    prompt: message,
    startTime,
  };

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const chunk of gatewayService.streamWithFallback(message, context)) {
      reply.raw.write(
        "data: " + JSON.stringify({ text: chunk }) + "\n\n"
      );
    }
    logChatRequest(request, {
      provider: "stream",
      cost: 0,
    });
    reply.raw.end();
  } catch (err) {
    fastify.log.error(err);
    reply.raw.write(
      "data: " +
        JSON.stringify({
          error: err instanceof Error ? err.message : "Stream failed.",
        }) +
        "\n\n"
    );
    reply.raw.end();
  }
}

fastify.get<{ Querystring: { message?: string; prompt?: string } }>(
  "/api/chat/stream",
  async (request, reply) => {
    const message = (
      request.query?.prompt ?? request.query?.message ?? ""
    ).trim();
    if (!message) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Query parameter 'prompt' or 'message' is required.",
      });
    }
    return handleStream(request, reply, message);
  }
);

fastify.post<{ Body: { message: string } }>(
  "/api/chat/stream",
  { schema: { body: chatBodySchema } },
  async (request, reply) => {
    const { message } = request.body;
    return handleStream(request, reply, message);
  }
);

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

setup()
  .then(() => {
    fastify.listen({ host, port }, (err, address) => {
      if (err) {
        fastify.log.error(err);
        process.exit(1);
      }
      fastify.log.info({ address }, "Server listening");
    });
  })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
