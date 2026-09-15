import type { ApiResponse } from "../types/api-contracts";
import type { components } from "../types/api.generated";
export type StripeMapping = components["schemas"]["StripeMappingRead"];
export type StripeCheck = ApiResponse<"/api/v1/admin/subscription-plans/{code}/revisions/{revision}/check-stripe", "post">;
export type Configuration = components["schemas"]["PlanConfigurationRead"];
export type Plan = components["schemas"]["PlanRevisionRead"];
export type SavedPlan = ApiResponse<"/api/v1/admin/subscription-plans", "post">;
export type PlanList = ApiResponse<"/api/v1/admin/subscription-plans", "get">;
export const blank = (): Configuration => ({
  name: "",
  description: "",
  state: "draft",
  currency: "EUR",
  billing_type: "free",
  monthly_price: "0.00",
  annual_price: null,
  tax_display: "inclusive",
  max_digests: 1,
  max_papers_per_run: 10,
  papers_per_month: 10,
  runs_per_month: 1,
  manual_runs_per_month: 1,
  schedule_frequencies: [],
  email_delivery: true,
  trial_days: 0,
  display_order: 0,
});
export const limits = [
  ["max_digests", "Maximum digests", 1, 10000],
  ["max_papers_per_run", "Maximum papers per run", 1, 30],
  ["papers_per_month", "Papers per monthly allowance period", 1, 1000000],
  ["runs_per_month", "Total runs per monthly allowance period", 0, 100000],
  ["manual_runs_per_month", "Manual runs within that total", 0, 100000],
  ["trial_days", "Trial days (0 = none)", 0, 365],
  ["display_order", "Display order", 0, 10000],
] as const;
export const frequencies: Configuration["schedule_frequencies"] = ["daily", "weekly", "monthly", "quarterly"];
export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const grid = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
  gap: 2,
};
