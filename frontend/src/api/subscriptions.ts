import { apiRequest } from "./client";
import type {
  Access,
  BillingStatus,
  ChangeData,
  ActiveDigests,
  Notice,
  UpgradeData,
  Upgrade,
  FreeChoices,
  PublicPlan,
} from "../types/subscription";
const root = "/subscription";
const post = <T>(path: string, body?: unknown) =>
  apiRequest<T>(root + path, { method: "POST", body });
export const subscriptionsApi = {
  adminAccess: (id: string, offset: number) =>
    apiRequest<Access>(
      `/admin/subscription-access/${encodeURIComponent(id)}?offset=${offset}`,
    ),
  saveAccessPolicy: (
    id: string,
    body: { mode: string; expected_version: number; change_note: string },
  ) =>
    apiRequest(`/admin/subscription-access/${encodeURIComponent(id)}/policy`, {
      method: "POST",
      body,
    }),
  plans: () =>
    apiRequest<{ items: PublicPlan[] }>(root + "/plans", {
      authenticate: false,
    }),
  access: () => apiRequest<Access>(root),
  billing: () => apiRequest<BillingStatus>(root + "/billing"),
  changes: () => apiRequest<ChangeData>(root + "/billing/changes"),
  activeDigests: () =>
    apiRequest<ActiveDigests>(root + "/billing/active-digests"),
  notifications: () =>
    apiRequest<{ items: Notice[] }>(root + "/billing/notifications"),
  upgrades: () => apiRequest<UpgradeData>(root + "/billing/upgrades"),
  freeDigests: () => apiRequest<FreeChoices>(root + "/free-digests"),
  refreshBilling: () => post<BillingStatus>("/billing/refresh"),
  openBilling: (action: "portal" | "cancel" | "resume") =>
    post<{ url: string }>("/billing/" + action),
  checkout: (body: { code: string; revision: number; interval: string }) =>
    post<{ url: string }>("/billing/checkout", body),
  schedule: (body: {
    code: string;
    revision: number;
    interval: string;
    expected_period_end?: string;
    digest_ids: string[];
  }) => post("/billing/changes", body),
  changeAction: (id: string, action: "undo" | "retry") =>
    post(`/billing/changes/${encodeURIComponent(id)}/${action}`),
  saveActiveDigests: (digest_ids: string[]) =>
    apiRequest(root + "/billing/active-digests", {
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
    post<{ url: string }>(
      `/billing/upgrades/${encodeURIComponent(id)}/payment`,
    ),
};
export async function loadSubscription() {
  const [
    access,
    billing,
    changes,
    activeDigests,
    notices,
    upgrades,
    freeDigests,
  ] = await Promise.all([
    subscriptionsApi.access(),
    subscriptionsApi.billing(),
    subscriptionsApi.changes(),
    subscriptionsApi.activeDigests(),
    subscriptionsApi.notifications(),
    subscriptionsApi.upgrades(),
    subscriptionsApi.freeDigests(),
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
