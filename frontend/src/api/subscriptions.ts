import type { ApiResponse } from "../types/api-contracts";
import type { components } from "../types/api.generated";
import { apiRequest } from "./client";
import type {
  Access,
  BillingStatus,
  ChangeData,
  ActiveDigests,
  UpgradeData,
  Upgrade,
  FreeChoices,
} from "../types/subscription";
type Schemas = components["schemas"];
const root = "/subscription";
const post = <T>(path: string, body?: unknown) =>
  apiRequest<T>(root + path, { method: "POST", body });
export const subscriptionsApi = {
  adminAccess: (id: string, offset: number, signal?: AbortSignal) =>
    apiRequest<Schemas["AdminAccessRead"]>(
      `/admin/subscription-access/${encodeURIComponent(id)}?offset=${offset}`, { signal },
    ),
  saveAccessPolicy: (
    id: string,
    body: { mode: string; expected_version: number; change_note: string },
  ) =>
    apiRequest<Schemas["AccessPolicyRead"]>(`/admin/subscription-access/${encodeURIComponent(id)}/policy`, {
      method: "POST",
      body,
    }),
  plans: (signal?: AbortSignal) =>
    apiRequest<Schemas["PublicPlansRead"]>(root + "/plans", {
      authenticate: false, signal,
    }),
  enrolmentPlans: (signal?: AbortSignal) =>
    apiRequest<ApiResponse<"/api/v1/subscription/enrolment-plans", "get">>(
      root + "/enrolment-plans", { signal },
    ),
  access: (signal?: AbortSignal) => apiRequest<Access>(root, { signal }),
  billing: (signal?: AbortSignal) => apiRequest<BillingStatus>(root + "/billing", { signal }),
  changes: (signal?: AbortSignal) => apiRequest<ChangeData>(root + "/billing/changes", { signal }),
  activeDigests: (signal?: AbortSignal) =>
    apiRequest<ActiveDigests>(root + "/billing/active-digests", { signal }),
  notifications: (signal?: AbortSignal) =>
    apiRequest<Schemas["NotificationsRead"]>(root + "/billing/notifications", { signal }),
  upgrades: (signal?: AbortSignal) => apiRequest<UpgradeData>(root + "/billing/upgrades", { signal }),
  freeDigests: (signal?: AbortSignal) => apiRequest<FreeChoices>(root + "/free-digests", { signal }),
  refreshBilling: () => post<BillingStatus>("/billing/refresh"),
  openBilling: (action: "portal" | "cancel" | "resume") =>
    post<Schemas["RedirectRead"]>("/billing/" + action),
  checkout: (body: { code: string; revision: number; interval: string }) =>
    post<Schemas["RedirectRead"]>("/billing/checkout", body),
  schedule: (body: {
    code: string;
    revision: number;
    interval: string;
    expected_period_end?: string;
    digest_ids: string[];
  }) => post<Schemas["ChangeRead"]>("/billing/changes", body),
  changeAction: (id: string, action: "undo" | "retry") =>
    post<Schemas["ChangeRead"]>(`/billing/changes/${encodeURIComponent(id)}/${action}`),
  saveActiveDigests: (digest_ids: string[]) =>
    apiRequest<ActiveDigests>(root + "/billing/active-digests", {
      method: "PUT",
      body: { digest_ids },
    }),
  saveFreeDigests: (digest_ids: string[]) =>
    apiRequest<FreeChoices>(root + "/free-digests", {
      method: "PUT",
      body: { digest_ids },
    }),
  previewUpgrade: (body: { code: string; revision: number }) =>
    post<Upgrade>("/billing/upgrades/preview", body),
  upgradeAction: (id: string, action: "confirm" | "retry") =>
    post<Upgrade>(`/billing/upgrades/${encodeURIComponent(id)}/${action}`),
  payUpgrade: (id: string) =>
    post<Schemas["RedirectRead"]>(
      `/billing/upgrades/${encodeURIComponent(id)}/payment`,
    ),
};
export async function loadSubscription(signal?: AbortSignal) {
  const [
    access,
    billing,
    changes,
    activeDigests,
    notices,
    upgrades,
    freeDigests,
  ] = await Promise.all([
    subscriptionsApi.access(signal),
    subscriptionsApi.billing(signal),
    subscriptionsApi.changes(signal),
    subscriptionsApi.activeDigests(signal),
    subscriptionsApi.notifications(signal),
    subscriptionsApi.upgrades(signal),
    subscriptionsApi.freeDigests(signal),
  ]);
  return {
    access,
    billing,
    changes,
    activeDigests,
    notices: notices.items,
    upgrades,
    freeDigests,
  };
}
export type SubscriptionSnapshot = Awaited<ReturnType<typeof loadSubscription>>;
