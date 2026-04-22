/**
 * Kapselt Frontend-API-Requests, Session-Token und Basis-URL-Aufloesung.
 */
const apiBaseUrl = resolveApiBaseUrl();
export const storageKey = "leitstelle.session.token";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

declare global {
  interface Window {
    __LEITSTELLE_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

export async function apiRequest<TData>(path: string, init: RequestInit): Promise<TData> {
  const token = localStorage.getItem(storageKey);
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = await readApiPayload<TData>(response);
  const responseText = payload.rawText;
  if (!response.ok || !payload?.data) {
    throw new ApiRequestError(
      payload?.detail
      ?? payload?.title
      ?? responseText.trim()
      ?? "Request failed.",
      response.status
    );
  }
  return payload.data;
}

async function readApiPayload<TData>(response: Response): Promise<{ data?: TData; detail?: string; title?: string; rawText: string }> {
  if (typeof response.text === "function") {
    const rawText = await response.text();
    const parsed = parseApiPayload<TData>(rawText);
    return {
      ...(parsed ?? {}),
      rawText
    };
  }

  if (typeof response.json === "function") {
    const jsonPayload = (await response.json()) as { data?: TData; detail?: string; title?: string } | null;
    return {
      ...(jsonPayload ?? {}),
      rawText: ""
    };
  }

  return { rawText: "" };
}

function parseApiPayload<TData>(raw: string): { data?: TData; detail?: string; title?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as { data?: TData; detail?: string; title?: string };
  } catch {
    return null;
  }
}

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8080";
  }

  const configuredBaseUrl = window.__LEITSTELLE_CONFIG__?.apiBaseUrl?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/u, "");
  }

  const { hostname, origin, port } = window.location;
  if ((hostname === "127.0.0.1" || hostname === "localhost") && port === "4173") {
    return "http://127.0.0.1:8080";
  }

  return origin;
}
