import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  requestId: string;
  receivedAt: string;
  method: string;
  path: string;
};

export function createRequestContext(req: IncomingMessage): RequestContext {
  const headerValue = req.headers["x-request-id"];
  const requestId = typeof headerValue === "string" && headerValue.length > 0 ? headerValue : randomUUID();

  return {
    requestId,
    receivedAt: new Date().toISOString(),
    method: req.method ?? "GET",
    path: req.url ?? "/"
  };
}

