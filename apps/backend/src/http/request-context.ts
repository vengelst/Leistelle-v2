/**
 * Technischer Request-Kontext fuer das Backend.
 *
 * Die Datei erstellt pro HTTP-Request einen kleinen, stabilen Kontext mit
 * Request-ID, Zeitstempel und Basis-Metadaten fuer Logging, Audit und
 * Problem-Responses.
 */
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

export type RequestContextOptions = {
  trustProxy?: boolean;
};

export type RequestContext = {
  requestId: string;
  receivedAt: string;
  method: string;
  path: string;
  clientIp?: string;
  protocol: "http" | "https";
};

export function createRequestContext(req: IncomingMessage, options: RequestContextOptions = {}): RequestContext {
  const headerValue = req.headers["x-request-id"];
  const requestId = typeof headerValue === "string" && headerValue.length > 0 ? headerValue : randomUUID();
  const clientIp = resolveClientIp(req, options.trustProxy === true);
  const protocol = resolveProtocol(req, options.trustProxy === true);

  return {
    requestId,
    receivedAt: new Date().toISOString(),
    method: req.method ?? "GET",
    path: req.url ?? "/",
    ...(clientIp ? { clientIp } : {}),
    protocol
  };
}

function resolveClientIp(req: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const forwardedFor = firstForwardedValue(req.headers["x-forwarded-for"]);
    if (forwardedFor) {
      return forwardedFor;
    }
  }

  return req.socket.remoteAddress ?? undefined;
}

function resolveProtocol(req: IncomingMessage, trustProxy: boolean): "http" | "https" {
  if (trustProxy) {
    const forwardedProto = firstForwardedValue(req.headers["x-forwarded-proto"]);
    if (forwardedProto === "https") {
      return "https";
    }
    if (forwardedProto === "http") {
      return "http";
    }
  }

  return (req.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
}

function firstForwardedValue(headerValue: string | string[] | undefined): string | undefined {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return rawValue?.split(",")[0]?.trim() || undefined;
}

