export type SpendingPreset =
  | "today"
  | "week"
  | "month"
  | "thisMonth"
  | "lastMonth";
export const spendingPresets: { id: SpendingPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
];
export function spendingRange(preset: SpendingPreset, now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  if (preset === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (preset === "month") start.setUTCDate(start.getUTCDate() - 29);
  if (preset === "thisMonth") start.setUTCDate(1);
  if (preset === "lastMonth") {
    end.setUTCDate(0);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
export function validSpendingRange(
  from: string,
  to: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  return Number.isFinite(days) && days >= 1 && days <= 93 && to <= today;
}
