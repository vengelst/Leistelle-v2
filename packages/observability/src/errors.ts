import type { ApiProblem } from "@leitstelle/contracts";

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;

  public constructor(
    message: string,
    options: {
      status: number;
      code: string;
      detail?: string;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail ?? message;
  }
}

export function toApiProblem(error: AppError, requestId: string): ApiProblem {
  return {
    type: "about:blank",
    title: error.message,
    status: error.status,
    detail: error.detail,
    requestId,
    code: error.code
  };
}
