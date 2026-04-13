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

