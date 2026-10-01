import type { Access, BillingStatus } from "./types/subscription";

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function usageNumber(value: unknown): string {
  const number = count(value);
  return number === null ? "Not available" : number.toLocaleString();
}

export function allowanceCard(access: Access, key: "runs" | "manual_runs" | "papers" | "digests") {
  const configKey = { runs: "runs_per_month", manual_runs: "manual_runs_per_month", papers: "papers_per_month", digests: "max_digests" } as const;
  const remaining = count(access.remaining[key]);
  const limit = count(access.plan?.configuration[configKey[key]]);
  const unlimited = access.mode === "complimentary" && access.remaining[key] === null;
  return {
    remaining: remaining === null ? unlimited ? "No subscription limit" : "Unverified" : usageNumber(remaining),
    limit: access.mode === "complimentary" ? null : limit,
    // A zero entitlement is not a newly exhausted allowance.
    state: remaining === null ? null : limit === 0 ? "Not included" : remaining === 0 ? "None remaining" : null,
  };
}

/** A pending paid checkout must not relabel the user's current Free access. */
export function currentBillingInterval(access: Access, billing: BillingStatus): string {
  if (access.mode === "complimentary") return "No subscription billing";
  if (access.billing_type === "free") return "Free — no subscription payment";
  if (access.billing_type !== "stripe") return "Not verified";
  return billing.attempt?.interval === "annual" ? "Yearly" : billing.attempt?.interval === "monthly" ? "Monthly" : "Not verified";
}
