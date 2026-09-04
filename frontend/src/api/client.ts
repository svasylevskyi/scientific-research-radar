import type { AuthResponse } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
export const AUTH_EXPIRED_EVENT = "research-radar:auth-expired";

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  authenticate?: boolean;
  retryAfterRefresh?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    authenticate = true,
    retryAfterRefresh = true,
    headers: suppliedHeaders,
    ...requestInit
  } = options;

  const headers = new Headers(suppliedHeaders);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (authenticate && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...requestInit,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });

  if (response.status === 401 && authenticate && retryAfterRefresh) {
    try {
      await refreshAccessToken();
      return apiRequest<T>(path, { ...options, retryAfterRefresh: false });
    } catch {
      setAccessToken(null);
    }
  }

  if (response.status === 401 && authenticate) {
    setAccessToken(null);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function refreshAccessToken(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = apiRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      authenticate: false,
      retryAfterRefresh: false,
    })
      .then((result) => {
        setAccessToken(result.access_token);
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
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
