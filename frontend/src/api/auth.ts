import { apiRequest, refreshAccessToken, setAccessToken } from "./client";
import type { AuthResponse, LoginInput, RegisterInput, User } from "../types/auth";

function acceptSession(result: AuthResponse): AuthResponse {
  setAccessToken(result.access_token);
  return result;
}

export const authApi = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const result = await apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: input,
      authenticate: false,
      retryAfterRefresh: false,
    });
    return acceptSession(result);
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const result = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: input,
      authenticate: false,
      retryAfterRefresh: false,
    });
    return acceptSession(result);
  },

  async refresh(): Promise<AuthResponse> {
    return refreshAccessToken();
  },

  async logout(): Promise<void> {
    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
        authenticate: false,
        retryAfterRefresh: false,
      });
    } finally {
      setAccessToken(null);
    }
  },

  me(): Promise<User> {
    return apiRequest<User>("/users/me");
  },
};
