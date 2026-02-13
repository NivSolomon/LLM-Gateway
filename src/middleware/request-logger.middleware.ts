import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    startTime?: number;
  }
}

const REQUEST_ID_HEADER = "x-request-id";

export async function requestLoggerMiddleware(
  fastify: FastifyInstance
): Promise<void> {
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    const id =
      (request.headers[REQUEST_ID_HEADER] as string)?.trim() || randomUUID();
    (request as FastifyRequest & { id: string }).id = id;
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  fastify.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = (request as FastifyRequest & { startTime?: number })
        .startTime;
      const latencyMs = startTime != null ? Date.now() - startTime : 0;
      request.log.info(
        {
          requestId: request.id,
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          latencyMs,
        },
        "request completed"
      );
    }
  );
}

export interface ChatRequestLog {
  requestId: string;
  promptLength: number;
  provider: string;
  latencyMs: number;
  cost: number;
}

export function logChatRequest(
  request: FastifyRequest,
  result: { provider: string; cost: number }
): void {
  const startTime = (request as FastifyRequest & { startTime?: number })
    .startTime;
  const latencyMs = startTime != null ? Date.now() - startTime : 0;
  const promptLength = getPromptLength(request);
  const payload: ChatRequestLog = {
    requestId: request.id,
    promptLength,
    provider: result.provider,
    latencyMs,
    cost: result.cost,
  };
  request.log.info(payload, "chat request");
}

function getPromptLength(request: FastifyRequest): number {
  const body = request.body as { message?: string } | undefined;
  const query = request.query as { message?: string } | undefined;
  const message = body?.message ?? query?.message ?? "";
  return typeof message === "string" ? message.length : 0;
}
