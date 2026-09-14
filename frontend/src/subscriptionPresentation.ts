import type {
  Access,
  BillingStatus,
  ChangeData,
  UpgradeData,
  PublicPlan,
} from "./types/subscription";
export function isCurrentPlan(
  plan: PublicPlan,
  access: Access | null,
  billing: BillingStatus | null,
) {
  if (access?.billing_type === "free") return plan.billing_type === "free";
  return (
    access?.billing_type === "stripe" && billing?.attempt?.code === plan.code
  );
}
export function subscriptionAction(
  access: Access,
  billing: BillingStatus,
  changes: ChangeData,
  upgrades: UpgradeData,
) {
  const upgrade = upgrades.upgrade;
  if (upgrade?.state === "pending_payment")
    return {
      text: "Your upgrade needs payment or authentication. Your previous plan remains subject to its existing payment terms.",
      label: "Complete upgrade payment",
      hash: "#upgrade",
    };
  if (upgrade && ["submitting", "needs_review"].includes(upgrade.state))
    return {
      text: "Your upgrade is awaiting verification. Review the saved request before making another change.",
      label: "Review upgrade",
      hash: "#upgrade",
    };
  if (
    changes.change &&
    (changes.change.retry_allowed ||
      changes.change.state === "awaiting_payment")
  )
    return {
      text: "Your scheduled change needs attention. Review its status and any payment instructions.",
      label: "Review scheduled change",
      hash: "#changes",
    };
  if (billing.resume_allowed)
    return {
      text: "You have an unfinished checkout. Resume it before choosing another paid plan.",
      label: "Resume checkout",
      hash: "#billing",
    };
  if (access.payment_issue || !access.allowed || access.grace_until)
    return {
      text: access.payment_issue || access.reason,
      label: "Review billing and access",
      hash: "#billing",
    };
  if (
    access.billing_type === "free" &&
    billing.attempt &&
    ["past_due", "unpaid"].includes(billing.attempt.subscription_status ?? "")
  )
    return {
      text: "Free access is available, but your previous subscription has a payment issue. Review billing for outstanding payments.",
      label: "Review billing",
      hash: "#billing",
    };
  if (
    access.remaining.runs === 0 ||
    access.remaining.papers === 0 ||
    access.remaining.manual_runs === 0
  )
    return {
      text: "A research allowance is exhausted. Review plan options or wait for the next monthly reset. Your saved research remains available.",
      label: "Review plan options",
      hash: "#plans",
    };
  return null;
}
export function subscriptionSection(hash: string) {
  if (hash === "#billing") return "billing";
  if (hash === "#digests") return "digests";
  if (hash === "#notifications") return "notifications";
  return "plans";
}
