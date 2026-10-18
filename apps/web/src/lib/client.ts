"use client";

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|; )jc_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("x-csrf-token", csrfToken());
  }
  const requestInit: RequestInit = { ...init, headers };
  if (init.json !== undefined) requestInit.body = JSON.stringify(init.json);
  else if (init.body !== undefined && init.body !== null) requestInit.body = init.body;
  delete (requestInit as { json?: unknown }).json;
  const response = await fetch(path, requestInit);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const body = payload as { message?: string; code?: string; correlationId?: string };
    const error = new Error(body.message ?? "Request failed");
    Object.assign(error, { code: body.code, correlationId: body.correlationId });
    throw error;
  }
  return payload as T;
}
