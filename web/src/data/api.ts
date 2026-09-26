/** Small fetch wrapper shared by every surface. Every call has a timeout: on bad Wi-Fi, failing fast beats hanging. */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: rest.body && !(rest.body instanceof Blob) ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    const type = res.headers.get("content-type") ?? "";
    return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export const postJson = <T>(path: string, body: unknown, timeoutMs?: number) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), timeoutMs });

/** Ids for anything created on this device. */
export const newId = () => crypto.randomUUID();
