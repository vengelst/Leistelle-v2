/**
 * Rohes Einlesen und Parsen von JSON-Request-Bodies.
 *
 * Die Datei bleibt absichtlich klein und HTTP-nah: Sie liest den Request-Stream
 * ein und liefert entweder JSON oder einen kontrollierten AppError zurueck.
 */
import type { IncomingMessage } from "node:http";

import { AppError } from "@leitstelle/observability";

const maxJsonBodyBytes = 1024 * 1024;

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += nextChunk.byteLength;
    if (totalBytes > maxJsonBodyBytes) {
      throw new AppError("Request body exceeds the maximum size.", {
        status: 413,
        code: "HTTP_BODY_TOO_LARGE"
      });
    }
    chunks.push(nextChunk);
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
