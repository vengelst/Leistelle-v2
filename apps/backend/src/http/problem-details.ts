/**
 * Uebersetzung unbekannter Laufzeitfehler in API-Problem-Details.
 *
 * Kontrollierte AppError-Instanzen werden detailgetreu ausgegeben; alles andere
 * wird auf ein generisches 500-Problem reduziert, damit keine internen Details
 * unkontrolliert nach aussen gelangen.
 */
import { AppError, toApiProblem } from "@leitstelle/observability";
import type { ApiProblem } from "@leitstelle/contracts";

export function toProblemResponse(error: unknown, requestId: string): ApiProblem {
  if (error instanceof AppError) {
    return toApiProblem(error, requestId);
  }

  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: 500,
    detail: "An unexpected error occurred.",
    requestId
  };
}

