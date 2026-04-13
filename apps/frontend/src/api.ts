const apiBaseUrl = "http://127.0.0.1:8080";
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
