/**
 * Fehlergrundtypen und Hilfsfunktionen fuer kontrollierte API-Fehler.
 *
 * Die Datei stellt einen einheitlichen Anwendungsfehler bereit, aus dem der
 * HTTP-Layer konsistente Problem-Details fuer Clients ableiten kann.
 */
import type { ApiProblem } from "@leitstelle/contracts";

/**
 * Einheitlicher Fehler fuer kontrollierte Anwendungsfehler.
 *
 * Fachmodule werfen AppError an der Grenze zwischen Business-Regel und HTTP-
 * Antwort. Der HTTP-Layer kann daraus dann ohne Sonderwissen ein konsistentes
 * Problem-Detail-Dokument erzeugen.
 */
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

// Uebersetzt den internen Fehler 1:1 in das API-Format.
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
