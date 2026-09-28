import type { AuthResponse } from "../types/auth";
import { CooldownPending, createRateLimitRetry } from "./rateLimitRetry";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
export const AUTH_EXPIRED_EVENT = "research-radar:auth-expired";

let accessToken: string | null = null;
let sessionGeneration = 0;
let sessionRequests = new AbortController();
const rateLimitRetry = createRateLimitRetry();
const sessionChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("radar-session") : null;
sessionChannel?.addEventListener("message", (event) => {
  if (event.data === "signed-out") {
    setAccessToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
});

export function announceSignOut(): void {
  setAccessToken(null);
  sessionChannel?.postMessage("signed-out");
}

export async function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  return navigator.locks ? await navigator.locks.request("radar-session", operation) : operation();
}

let refreshPromise: Promise<AuthResponse> | null = null;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  authenticate?: boolean;
  retryAfterRefresh?: boolean;
  /** Only the session refresh endpoint opts in; commands are never replayed after 429. */
  retryRateLimit?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RateLimitError extends ApiError {
  constructor(public readonly retryAt: number, read = true) {
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    const duration = seconds < 60 ? `${seconds} second${seconds === 1 ? "" : "s"}` : `${Math.ceil(seconds / 60)} minute${seconds <= 60 ? "" : "s"}`;
    super(read ? "Loading is taking longer than usual." : `Please wait about ${duration} before trying again.`, 429, seconds);
    this.name = "RateLimitError";
  }
}

export function setAccessToken(token: string | null): void {
  sessionGeneration += 1;
  sessionRequests.abort(new DOMException("Session changed", "AbortError"));
  sessionRequests = new AbortController();
  accessToken = token;
}

type SharedRead = { promise: Promise<unknown>; controller: AbortController; readers: number };
const reads = new Map<string, SharedRead>();
let mutationGeneration = 0;

/** Share concurrent identical reads, never completed results or mutation responses. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isRead = !options.method || options.method.toUpperCase() === "GET";
  if (!isRead) {
    mutationGeneration++;
    return request<T>(path, options, Date.now() + 15000).finally(() => { mutationGeneration++; });
  }
  options.signal?.throwIfAborted();
  const key = JSON.stringify([sessionGeneration, mutationGeneration, path, { ...options,
    method: "GET", signal: undefined, headers: [...new Headers(options.headers).entries()] }]);
  let entry = reads.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const created: SharedRead = { controller, readers: 0, promise: Promise.resolve() };
    created.promise = request<T>(path, { ...options, signal: controller.signal }, Date.now() + 15000)
      .finally(() => { if (reads.get(key) === created) reads.delete(key); });
    entry = created;
    reads.set(key, created);
  }
  const current = entry;
  current.readers++;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      options.signal?.removeEventListener("abort", abort);
      if (--current.readers === 0) current.controller.abort();
      return true;
    };
    const abort = () => { if (finish()) reject(options.signal?.reason); };
    options.signal?.addEventListener("abort", abort, { once: true });
    current.promise.then(value => { if (finish()) resolve(value as T); }, error => { if (finish()) reject(error); });
  });
}

async function request<T>(path: string, options: RequestOptions, deadline: number): Promise<T> {
  const {
    body,
    authenticate = true,
    retryAfterRefresh = true,
    retryRateLimit = false,
    headers: suppliedHeaders,
    ...requestInit
  } = options;

  const headers = new Headers(suppliedHeaders);
  headers.set("X-Radar-Request", "1");
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const signal = requestInit.signal
    ? AbortSignal.any([requestInit.signal, sessionRequests.signal]) : sessionRequests.signal;
  const requestKey = `${(requestInit.method ?? "GET").toUpperCase()} ${path.split("?")[0]}`;
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  let response: Response;
  const isRead = !requestInit.method || ["GET", "HEAD"].includes(requestInit.method.toUpperCase());
  let attempts = 0;
  for (;;) {
    try {
      await rateLimitRetry.ready(requestKey, signal, isRead || retryRateLimit ? deadline : Date.now());
    } catch (error) {
      if (error instanceof CooldownPending) throw new RateLimitError(error.retryAt, isRead || retryRateLimit);
      throw error;
    }
    if (authenticate && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    response = await fetch(`${API_URL}${path}`, { ...requestInit, signal, headers,
      body: serializedBody, credentials: "include" });
    if (response.status !== 429 || response.headers.get("X-Radar-Retryable") === "false") break;
    const retryAt = rateLimitRetry.defer(requestKey, response, attempts++);
    await response.body?.cancel();
    // A proxy can return 429 too. Never assume a command was not processed.
    if ((!isRead && !(retryRateLimit && response.headers.has("X-Radar-Rate-Limit-Scope"))) || attempts > 3 || retryAt >= deadline)
      throw new RateLimitError(retryAt, isRead || retryRateLimit);
  }

  if (response.status === 401 && authenticate && retryAfterRefresh) {
    try {
      await refreshAccessToken();
      signal.throwIfAborted();
      return request<T>(path, { ...options, retryAfterRefresh: false }, deadline);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      setAccessToken(null);
    }
  }

  if (response.status === 401 && authenticate) {
    setAccessToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ApiError(await readErrorMessage(response), response.status, retryAfter > 0 ? retryAfter : null);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function refreshAccessToken(): Promise<AuthResponse> {
  if (!refreshPromise) {
    const generation = sessionGeneration;
    refreshPromise = withSessionLock(async () => {
      if (generation !== sessionGeneration) throw new ApiError("Session changed. Please try again.", 409);
      let result: AuthResponse;
      try {
        result = await requestRefresh();
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (generation !== sessionGeneration) throw error;
        result = await requestRefresh();
      }
      if (generation !== sessionGeneration) throw new ApiError("Session changed. Please try again.", 409);
      accessToken = result.access_token;
      return result;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

function requestRefresh(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/refresh", {
    method: "POST", authenticate: false, retryAfterRefresh: false, retryRateLimit: true,
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload.detail) && payload.detail.length > 0) {
      const first = payload.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  } catch {
    // Fall back to the status text when the response has no JSON body.
  }
  return response.statusText || "Something went wrong. Please try again.";
}
