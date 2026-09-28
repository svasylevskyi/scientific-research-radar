import { useCallback } from "react";
import { apiRequest } from "../api/client";
import { usePollingResource } from "./usePollingResource";
export type SubscriptionAccess = import("../types/api.generated").components["schemas"]["AccessRead"];
export function useSubscriptionAccess(digestId?: string, runId?: string, adminOwner?: string, enabled = true, refreshKey?: string) {
  const query = new URLSearchParams();
  if (digestId) query.set("digest_id", digestId);
  if (runId) query.set("run_id", runId);
  const path = adminOwner ? `/admin/subscription-access/${adminOwner}` : `/subscription?${query}`;
  const load = useCallback((signal: AbortSignal) => enabled
    ? apiRequest<SubscriptionAccess>(path, { signal }) : Promise.resolve(null), [path, enabled, refreshKey]);
  const resource = usePollingResource(load);
  return { ...resource, data: enabled ? resource.data : null, loading: enabled && resource.loading };
}
