import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

type Schemas = components["schemas"];
export type AccountClosure = Schemas["ClosureRead"];
export const closureLabels: Record<AccountClosure["state"], string> = {
  pending: "Closure requested", waiting: "Closure in progress", needs_review: "Closure needs review", completed: "Closed",
};
const base = (userId: string) => `/admin/users/${userId}/closure`;
export const accountClosureApi = {
  request: (password: string, userId?: string) => apiRequest<AccountClosure>(userId ? base(userId) : "/users/me/closure",
    { method: "POST", body: { current_password: password, confirmation: "CLOSE" } }),
  get: (userId: string, signal?: AbortSignal) => apiRequest<AccountClosure | null>(base(userId), { signal }),
  retry: (userId: string) => apiRequest<AccountClosure>(`${base(userId)}/retry`, { method: "POST" }),
  recover: (userId: string, attemptId: string, checkoutId: string) => apiRequest<AccountClosure>(`${base(userId)}/checkout`,
    { method: "POST", body: { attempt_id: attemptId, checkout_id: checkoutId } }),
  contacts: (userId: string) => apiRequest<Schemas["ContactMessageRead"][]>(`${base(userId)}/contact-messages`),
  reviewContact: (userId: string, messageId: string, decision: "delete" | "unrelated") => apiRequest<AccountClosure>(`${base(userId)}/contact-messages/${messageId}`, { method: "POST", body: { decision } }),
};
