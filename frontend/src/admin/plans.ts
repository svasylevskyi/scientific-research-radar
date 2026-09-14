export type StripeMapping = {
  product_id: string;
  monthly_price_id: string;
  annual_price_id: string | null;
};
export type StripeCheck = {
  matches: boolean;
  issues: string[];
  checked_at: string;
  prices: {
    interval: string;
    price_id: string;
    tax_behavior: string | null;
    currency: string;
    unit_amount: number;
  }[];
};
export type Configuration = {
  name: string;
  description: string;
  state: string;
  currency: string;
  monthly_price: string;
  annual_price: string | null;
  tax_display: string;
  max_digests: number;
  max_papers_per_run: number;
  papers_per_month: number;
  runs_per_month: number;
  manual_runs_per_month: number;
  schedule_frequencies: string[];
  stripe_sandbox?: StripeMapping | null;
  billing_type?: "stripe" | "free";
  subscriber_visible?: boolean;
  email_delivery: boolean;
  trial_days: number;
  display_order: number;
};
export type Plan = {
  id: number;
  code: string;
  revision: number;
  configuration: Configuration;
  warnings?: string[];
  change_note: string;
  created_by: string | null;
  created_at: string;
};
export type PlanList = { items: Plan[]; total: number };
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
export const frequencies = ["daily", "weekly", "monthly", "quarterly"];
export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const grid = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
  gap: 2,
};
