import type { IncomingMessage } from "node:http";

import { AppError } from "@leitstelle/observability";

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (raw.length === 0) {
    throw new AppError("Request body is required.", {
      status: 400,
      code: "HTTP_BODY_REQUIRED"
    });
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError("Request body is not valid JSON.", {
      status: 400,
      code: "HTTP_BODY_INVALID_JSON"
    });
  }
}
