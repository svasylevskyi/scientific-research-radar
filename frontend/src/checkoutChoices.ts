import type { BillingInterval } from "./components/BillingIntervalTabs";
import type { BillingStatus, PublicPlan } from "./types/subscription";
import type { PlanAccount } from "./planChoices";

type Attempt = NonNullable<BillingStatus["attempt"]>;
export type CheckoutSelection = {
  plan: PublicPlan;
  interval: BillingInterval;
  source: Attempt | null;
};

/** A matching tier is not enough: never resume Monthly from a Yearly card. */
export function checkoutMatches(plan: PublicPlan, interval: BillingInterval, billing: BillingStatus | null): boolean {
  const attempt = billing?.attempt;
  return !!billing?.resume_allowed && !billing.replacement && !!attempt?.id &&
    attempt.code === plan.code && attempt.interval === interval;
}
export function canSelectCheckout(account: PlanAccount | null): boolean {
  return !!account && account.access.billing_type !== "stripe" && account.access.mode !== "complimentary" &&
    !account.billing.replacement && (account.billing.checkout_allowed ||
      (account.billing.replace_allowed === true && !!account.billing.attempt?.id));
}
export function selectCheckout(plan: PublicPlan, interval: BillingInterval, billing: BillingStatus | null): CheckoutSelection {
  // Polling and interval changes may not rewrite the terms the user is reviewing.
  return JSON.parse(JSON.stringify({ plan, interval,
    source: billing?.replace_allowed && billing.attempt?.id ? billing.attempt : null }));
}
export function checkoutStillAvailable(selection: CheckoutSelection | null, account: PlanAccount | null): boolean {
  if (!selection || !canSelectCheckout(account)) return false;
  if (!selection.source) return account!.billing.checkout_allowed;
  const now = account!.billing.attempt;
  const old = selection.source;
  return account!.billing.replace_allowed === true && !!now && now.id === old.id &&
    now.code === old.code && now.revision === old.revision && now.interval === old.interval &&
    now.price === old.price && now.currency === old.currency;
}
export function savedCheckoutLabel(attempt: Pick<Attempt, "plan_name" | "interval" | "price" | "currency">): string {
  const interval = attempt.interval === "annual" ? "Yearly" : attempt.interval === "monthly" ? "Monthly" : "Interval unverified";
  const price = attempt.price;
  const currency = attempt.currency;
  let amount = "Price unverified";
  if (price && /^\d+(?:\.\d{1,2})?$/.test(price) && Number.isFinite(Number(price)) && currency && /^[A-Za-z]{3}$/.test(currency)) {
    amount = new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(Number(price));
  }
  return `${attempt.plan_name} — ${interval} · ${amount}${attempt.interval === "annual" ? " / year" : attempt.interval === "monthly" ? " / month" : ""}`;
}
