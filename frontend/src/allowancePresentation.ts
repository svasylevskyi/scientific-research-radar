import type { SubscriptionAccess } from "./hooks/useSubscriptionAccess";

export type AllowanceContext = "create" | "digest";

export function allowanceDate(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? "the next allowance reset" : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

/** Keep server-specific restrictions, but present dates and actions once. */
export function allowanceText(value: string): string {
  return value
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, allowanceDate)
    .replace("Your digest limit is reached. Upgrade to a plan with more digests, or delete an unused digest to free a slot.", "Your digest limit is reached. Delete an unused digest to free a slot.")
    .replace("Scheduling is not included in your plan. Upgrade to a plan with scheduled runs.", "Scheduling is not included in your plan.")
    .replace("Reduce Maximum papers or upgrade your subscription.", "Reduce Maximum papers before running.")
    .replace("Reduce Maximum papers to the per-run plan limit or upgrade your subscription.", "Reduce Maximum papers to the per-run plan limit.")
    .replace("Delete an unused digest or upgrade to a plan with more digest slots.", "Delete an unused digest to return within the plan limit.");
}

export function allowanceMessage(data: SubscriptionAccess | null, context: AllowanceContext): string | null {
  if (!data) return null;
  if (!data.allowed) return allowanceText(data.reason);
  if (context === "create") {
    return data.create_allowed ? null : [...new Set(data.create_reasons.map(allowanceText))].join(" ");
  }
  const exhausted: string[] = [];
  if (data.remaining.runs === 0) exhausted.push("research runs");
  if (data.remaining.papers === 0) exhausted.push("papers");
  if (data.remaining.manual_runs === 0) exhausted.push("manual runs");
  const reasons = [...(data.run_reasons ?? []), ...data.schedule_reasons].filter(reason => {
    if (exhausted.length && reason.startsWith("Monthly allowances reset")) return false;
    if (data.remaining.runs === 0 && reason.startsWith("Monthly run allowance")) return false;
    if (data.remaining.papers === 0 && reason.startsWith("Monthly paper allowance")) return false;
    if (data.remaining.manual_runs === 0 && reason.startsWith("Monthly manual-run allowance")) return false;
    return true;
  });
  const parts = [...new Set(reasons.map(allowanceText))];
  if (exhausted.length) {
    parts.unshift(`Monthly allowances exhausted: ${exhausted.join(", ")}.`);
    if (data.period_end) parts.push(`Allowances reset on ${allowanceDate(data.period_end)}.`);
    parts.push(data.schedule_allowed
      ? data.remaining.runs === 0 || data.remaining.papers === 0
        ? "You can still edit this digest and save schedules; research resumes when allowances are available."
        : reasons.length ? "You can still edit this digest and save included schedules." : "You can still edit this digest and use included schedules."
      : "You can still edit this digest and view saved results.");
  }
  return parts.length ? parts.join(" ") : null;
}
