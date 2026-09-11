import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../api/client";
import { startPagePolling } from "../pagePolling";
import type { DigestFrequency } from "../types/digest";
export type SubscriptionAccess = {
  mode: string; allowed: boolean; reason: string; create_allowed: boolean; create_reasons: string[];
  schedule_allowed: boolean; schedule_reasons: string[]; paper_limit: number; research_warning: string | null;
  run_allowed?: boolean; run_reasons?: string[]; retry_allowed?: boolean; retry_reasons?: string[];
  plan: { configuration: { max_papers_per_run: number; schedule_frequencies: DigestFrequency[]; email_delivery: boolean } } | null;
};
export function useSubscriptionAccess(digestId?: string, runId?: string, adminOwner?: string, enabled = true, refreshKey?: string) {
  const query = new URLSearchParams();
  if (digestId) query.set("digest_id", digestId);
  if (runId) query.set("run_id", runId);
  const path = adminOwner ? `/admin/subscription-access/${adminOwner}` : `/subscription?${query}`;
  const [state, setState] = useState<{ path: string; data: SubscriptionAccess | null; error: string | null }>({ path, data: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    setState({ path, data: null, error: null });
    const stop = startPagePolling(async () => {
      try {
        const data = await apiRequest<SubscriptionAccess>(path);
        if (mounted) setState({ path, data, error: null });
      } catch (error) {
        if (mounted) setState(previous => ({ path, data: previous.path === path ? previous.data : null,
          error: error instanceof ApiError ? error.message : "Could not check subscription allowances. Trying again shortly." }));
      }
    }, 10000);
    return () => { mounted = false; stop(); };
  }, [path, enabled, refreshKey]);
  const data = enabled && state.path === path ? state.data : null;
  return { data, error: state.path === path ? state.error : null, loading: enabled && !data && !state.error };
}
