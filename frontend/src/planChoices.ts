import type { Access, BillingStatus, Change, ChangeData, ChangeOption, FreeChoices, PublicPlan, UpgradeData, UpgradeOption } from "./types/subscription";
import type { BillingInterval } from "./components/BillingIntervalTabs";
import { isCurrentPlan } from "./subscriptionPresentation";

/** These are server observations, not a second entitlement/billing policy. */
export type PlanAccount = {
  access: Access;
  billing: BillingStatus;
  changes?: ChangeData;
  upgrades?: UpgradeData;
  freeDigests?: FreeChoices;
};
type ChoicePlan = Pick<PublicPlan, "code" | "revision" | "name" | "billing_type">;
export type RenewalChoice = { kind: "renewal"; plan: ChoicePlan; option: ChangeOption;
  effectiveAt: string; origin: string; intervalOnly: boolean; direction: "Upgrade" | "Downgrade" | "Change" };
export type PlanChoice =
  | { kind: "upgrade"; plan: ChoicePlan; option: UpgradeOption; origin: string; atRenewal?: RenewalChoice }
  | RenewalChoice
  | { kind: "free"; plan: ChoicePlan; origin: string };

const limits = ["max_digests", "max_papers_per_run", "papers_per_month", "runs_per_month", "manual_runs_per_month"] as const;
function includes(a: PublicPlan | NonNullable<Access["plan"]>["configuration"],
  b: PublicPlan | NonNullable<Access["plan"]>["configuration"]): boolean {
  return limits.every(key => typeof a[key] === "number" && typeof b[key] === "number" && a[key] >= b[key]) &&
    (b.schedule_frequencies ?? []).every(value => (a.schedule_frequencies ?? []).includes(value)) &&
    (!b.email_delivery || !!a.email_delivery);
}
/** Only a label fallback for currently unavailable offers; never authorizes a change. */
export function planDirection(plan: PublicPlan, account: PlanAccount | null): "Upgrade" | "Downgrade" | "Change" {
  if (account?.access.billing_type === "free" && plan.billing_type !== "free") return "Upgrade";
  if (account?.access.billing_type === "stripe" && plan.billing_type === "free") return "Downgrade";
  const current = account?.access.plan?.configuration;
  if (current && includes(plan, current) && !includes(current, plan)) return "Upgrade";
  if (current && includes(current, plan) && !includes(plan, current)) return "Downgrade";
  return "Change";
}
export function planOrigin(account: PlanAccount): string {
  return JSON.stringify([account.access.billing_type, account.access.checkout_id, account.access.plan?.id,
    account.billing.attempt?.code, account.billing.attempt?.revision, account.billing.attempt?.interval,
    account.billing.period_end, account.billing.cancel_at_period_end]);
}
function samePrice(plan: PublicPlan, option: UpgradeOption | ChangeOption, interval: BillingInterval) {
  const price = interval === "annual" ? plan.annual_price : plan.monthly_price;
  return option.code === plan.code && option.revision === plan.revision && option.interval === interval &&
    price !== null && /^\d+(?:\.\d{1,2})?$/.test(price) && /^\d+(?:\.\d{1,2})?$/.test(option.price) && option.currency.toUpperCase() === plan.currency.toUpperCase() &&
    Number.isFinite(Number(price)) && Number(price) === Number(option.price);
}
export function planChoice(plan: PublicPlan, interval: BillingInterval, account: PlanAccount | null): PlanChoice | null {
  if (!account || account.access.billing_type !== "stripe") return null;
  if (!account.access.allowed || account.access.payment_issue || account.access.grace_until) return null;
  const origin = planOrigin(account);
  if (plan.billing_type === "free") {
    // Free is cancellation of renewal, never a second Checkout subscription.
    return account.billing.cancel_allowed && account.freeDigests?.available &&
      account.freeDigests.plan_name === plan.name ? { kind: "free", plan, origin } : null;
  }
  if (isCurrentPlan(plan, account.access, account.billing)) {
    // Interval-only changes retain the purchased revision, not today's catalogue revision.
    const option = account.changes?.items.find(o => o.code === account.billing.attempt?.code &&
      o.revision === account.billing.attempt?.revision && o.interval === interval && interval !== account.billing.attempt?.interval);
    return option && account.changes?.effective_at
      ? { kind: "renewal", plan, option, effectiveAt: account.changes.effective_at, origin, intervalOnly: true, direction: "Change" } : null;
  }
  const change = account.changes?.items.find(o => samePrice(plan, o, interval));
  const direction = planDirection(plan, account);
  // Existing server-authorized downgrades may lower price with equal benefits.
  const renewalDirection = direction === "Change" && account.access.plan && includes(account.access.plan.configuration, plan)
    ? "Downgrade" : direction;
  const renewal: RenewalChoice | null = change && account.changes?.effective_at
    ? { kind: "renewal", plan, option: change, effectiveAt: account.changes.effective_at, origin,
        intervalOnly: false, direction: renewalDirection } : null;
  const upgrade = account.upgrades?.items.find(o => samePrice(plan, o, interval));
  if (upgrade) return { kind: "upgrade", plan, option: upgrade, origin,
    ...(renewal?.direction === "Upgrade" ? { atRenewal: renewal } : {}) };
  return renewal;
}
export function choiceLabel(choice: PlanChoice): string {
  if (choice.kind === "upgrade") return `Upgrade to ${choice.plan.name}`;
  if (choice.kind === "free") return `Downgrade to ${choice.plan.name}`;
  return choice.intervalOnly
    ? `Switch to ${choice.option.interval === "annual" ? "Yearly" : "Monthly"}`
    : `${choice.direction} to ${choice.plan.name}`;
}
export function choiceStillAvailable(choice: PlanChoice, account: PlanAccount | null): boolean {
  if (!account || choice.origin !== planOrigin(account)) return false;
  if (!account.access.allowed || account.access.payment_issue || account.access.grace_until) return false;
  if (choice.kind === "free") return account.billing.cancel_allowed && !!account.freeDigests?.available && account.freeDigests.plan_name === choice.plan.name;
  const options = choice.kind === "upgrade" ? account.upgrades?.items : account.changes?.items;
  return !!options?.some(option => JSON.stringify(option) === JSON.stringify(choice.option)) &&
    (choice.kind !== "renewal" || account.changes?.effective_at === choice.effectiveAt);

}
export function selectionIdsValid(ids: string[], option: ChangeOption, digests: ChangeData["digests"]): boolean {
  return new Set(ids).size === ids.length && ids.length === Math.min(option.max_digests, digests.length) &&
    ids.every(id => digests.some(d => d.id === id));
}

/** Retain interval switching even when the purchased tier is no longer published. */
export function currentIntervalChoices(account: PlanAccount | null): PlanChoice[] {
  const attempt = account?.billing.attempt;
  if (!account || !attempt || account.access.billing_type !== "stripe" || !account.changes?.effective_at) return [];
  return account.changes.items.filter(o => o.code === attempt.code && o.revision === attempt.revision && o.interval !== attempt.interval)
    .map(option => ({ kind: "renewal" as const,
      plan: { code: option.code, revision: option.revision, name: option.name, billing_type: "stripe" as const },
      option, effectiveAt: account.changes!.effective_at!, origin: planOrigin(account), intervalOnly: true, direction: "Change" as const }));
}

/** A browser cutoff prevents stale dialogs being submitted; the server rechecks. */
export function canCancelPlanChange(change: Change | null | undefined, now = Date.now()): boolean {
  return !!change && change.state === "scheduled" && change.undo_allowed &&
    Date.parse(change.effective_at) > now + 30_000;
}
export function hasPendingPlanChange(change: Change | null | undefined): boolean {
  return !!change && !["applied", "undone", "stopped"].includes(change.state);
}
