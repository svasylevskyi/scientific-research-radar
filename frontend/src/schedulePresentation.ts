import type { SchedulePreview } from "./types/digest";

export const scheduleFrequencies = ["daily", "weekly", "monthly", "quarterly"] as const;
export const frequencyLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The editor continues to use the browser's local clock; this does not compute recurrence. */
export function localScheduleInput(value: Date): string {
  if (!Number.isFinite(value.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function scheduleDateErrors(startsAt: string, endsAt: string): { start?: string; end?: string } {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  // Round-trip validation also rejects nonexistent local times at a DST transition.
  const invalidStart = !Number.isFinite(start.getTime()) || localScheduleInput(start) !== startsAt;
  const invalidEnd = end && (!Number.isFinite(end.getTime()) || localScheduleInput(end) !== endsAt);
  if (invalidStart || invalidEnd) return {
    start: invalidStart ? "Choose a valid date and time in your time zone." : undefined,
    end: invalidEnd ? "Choose a valid date and time in your time zone." : undefined,
  };
  return end && end <= start ? { end: "Schedule end must be after the first digest date and time." } : {};
}

/** Never silently fall back to the browser timezone for a saved schedule. */
export function scheduleDateLabel(value: string | null | undefined, timeZone: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone, timeZoneName: "short",
    }).format(date);
  } catch {
    return "Date unavailable in the saved time zone";
  }
}

export function scheduleStateLabel(state?: SchedulePreview["state"]): string {
  switch (state) {
    case "not_scheduled": return "Not scheduled";
    case "scheduled": return "Scheduled";
    case "due": return "Due — waiting to start";
    case "queued": return "Queued";
    case "running": return "Running";
    case "waiting_for_run": return "Waiting for another run";
    case "waiting_for_subscription": return "Subscription review needed";
    case "waiting_for_allowance": return "Waiting for usage allowance";
    case "ended": return "Schedule ended";
    default: return "Checking schedule…";
  }
}

export function scheduleProgressPath(digestId: string, preview: SchedulePreview): string | null {
  if ((preview.state === "queued" || preview.state === "running") && preview.active_run_id) {
    return `/radar/digests/${encodeURIComponent(digestId)}?${new URLSearchParams({ run_id: preview.active_run_id, output_tab: "steps" })}`;
  }
  if (preview.state === "waiting_for_run" && preview.waiting_digest_id) {
    return `/radar/digests/${encodeURIComponent(preview.waiting_digest_id)}`;
  }
  return null;
}
