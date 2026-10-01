import type { BillingInterval } from "./components/BillingIntervalTabs";
import type { PublicPlan } from "./types/subscription";

export type PlanPrice = {
  amount: string;
  unit: string;
  note: string;
  monthlyEquivalent: string | null;
  savings: string | null;
};

// Catalogue currencies (EUR/USD/GBP/PLN) all use two decimal places.
// Compare integer minor units, not floats or formatted/localized strings.
function minorUnits(value: string | null): number | null {
  if (value === null || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function planPrice(
  plan: Pick<PublicPlan, "billing_type" | "currency" | "monthly_price" | "annual_price">,
  interval: BillingInterval,
  locale?: string,
): PlanPrice {
  const empty = { monthlyEquivalent: null, savings: null };
  if (plan.billing_type === "free") {
    return { ...empty, amount: "Free", unit: "", note: "No payment details or checkout required." };
  }
  if (interval === "annual" && plan.annual_price === null) {
    return { ...empty, amount: "Yearly billing not available", unit: "", note: "Switch to Monthly to see this plan’s price." };
  }
  const monthly = minorUnits(plan.monthly_price);
  const yearly = minorUnits(plan.annual_price);
  const charge = interval === "annual" ? yearly : monthly;
  if (charge === null || !["EUR", "USD", "GBP", "PLN"].includes(plan.currency)) {
    return { ...empty, amount: "Price unavailable", unit: "", note: "Refresh the plans to check the current price." };
  }
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: plan.currency });
  const money = (minor: number) => formatter.format(minor / 100);
  const result: PlanPrice = {
    ...empty,
    amount: money(charge),
    unit: interval === "annual" ? "/ year" : "/ month",
    note: interval === "annual" ? "Billed yearly. Tax included." : "Billed monthly. Tax included.",
  };
  if (interval === "annual") {
    // Approximation is secondary to the actual yearly charge. Hide sub-cent
    // equivalents rather than suggesting a positive subscription costs zero.
    const equivalent = Math.round(charge / 12);
    if (equivalent > 0) result.monthlyEquivalent = `About ${money(equivalent)} / month, billed yearly.`;
    if (monthly !== null && monthly > 0 && Number.isSafeInteger(monthly * 12) && charge < monthly * 12) {
      result.savings = `Save ${money(monthly * 12 - charge)} per year compared with 12 monthly payments.`;
    }
  }
  return result;
}

export type PlanFeature = { label: string; value: string; detail?: string };
export function planFeatures(plan: PublicPlan, locale?: string): PlanFeature[] {
  const number = new Intl.NumberFormat(locale);
  const count = (value: number) => number.format(value);
  const frequencies: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly",
  };
  return [
    { label: "Saved digests", value: count(plan.max_digests) },
    { label: "Papers per run", value: `Up to ${count(plan.max_papers_per_run)}` },
    { label: "Papers per month", value: `${count(plan.papers_per_month)} total` },
    { label: "Runs per month", value: `${count(plan.runs_per_month)} total` },
    { label: "Manual runs per month", value: `Up to ${count(plan.manual_runs_per_month)}`, detail: "Included in total runs" },
    { label: "Scheduling", value: plan.schedule_frequencies.map((value) => frequencies[value] ?? value).join(", ") || "Not included" },
    { label: "Email delivery", value: plan.email_delivery ? "Included" : "Not included" },
  ];
}
