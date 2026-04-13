const apiBaseUrl = resolveApiBaseUrl();
export const storageKey = "leitstelle.session.token";

export async function apiRequest<TData>(path: string, init: RequestInit): Promise<TData> {
  const token = localStorage.getItem(storageKey);
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload = (await response.json()) as { data?: TData; detail?: string; title?: string };
  if (!response.ok || !payload.data) throw new Error(payload.detail ?? payload.title ?? "Request failed.");
  return payload.data;
}

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8080";
  }

  const { hostname, origin, port } = window.location;
  if ((hostname === "127.0.0.1" || hostname === "localhost") && port === "4173") {
    return "http://127.0.0.1:8080";
  }

  return `${origin}/api`;
}
