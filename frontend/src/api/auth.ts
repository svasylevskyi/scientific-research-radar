import { apiRequest, refreshAccessToken, setAccessToken, withSessionLock, announceSignOut } from "./client";
import type { AuthResponse, LoginInput, RegisterInput, User } from "../types/auth";
import type { EmailVerification } from "../components/EmailVerificationForm";

function acceptSession(result: AuthResponse): AuthResponse {
  setAccessToken(result.access_token);
  return result;
}

export const authApi = {
  forgotPassword(email: string): Promise<{ message: string }> {
    return apiRequest("/auth/forgot-password", { method: "POST", body: { email }, authenticate: false, retryAfterRefresh: false });
  },
  resetPassword(token: string, password: string, password_confirmation: string): Promise<{ message: string }> {
    return apiRequest("/auth/reset-password", { method: "POST", body: { token, password, password_confirmation }, authenticate: false, retryAfterRefresh: false });
  },
  async register(input: RegisterInput): Promise<EmailVerification> {
    return apiRequest<EmailVerification>("/auth/register", {
      method: "POST",
      body: input,
      authenticate: false,
      retryAfterRefresh: false,
    });
  },

  resendRegistration(id: string): Promise<EmailVerification> {
    return apiRequest<EmailVerification>(`/auth/register/${id}/resend`, {
      method: "POST", authenticate: false, retryAfterRefresh: false,
    });
  },

  async confirmRegistration(id: string, code: string): Promise<AuthResponse> {
    return withSessionLock(async () => acceptSession(await apiRequest<AuthResponse>(`/auth/register/${id}/confirm`, {
      method: "POST", body: { code }, authenticate: false, retryAfterRefresh: false,
    })));
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    return withSessionLock(async () => {
      const result = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: input,
        authenticate: false,
        retryAfterRefresh: false,
      });
      return acceptSession(result);
    });
  },

  async refresh(): Promise<AuthResponse> {
    return refreshAccessToken();
  },

  async logout(): Promise<void> {
    try {
      await withSessionLock(() => apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
        authenticate: false,
        retryAfterRefresh: false,
      }));
    } finally {
      announceSignOut();
    }
  },

  me(): Promise<User> {
    return apiRequest<User>("/users/me");
  },
};
