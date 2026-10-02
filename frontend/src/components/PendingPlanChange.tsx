import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { useSubscription } from "./SubscriptionData";
import { usePlanChangeDialog } from "./PlanChangeDialog";
import { canCancelPlanChange, hasPendingPlanChange } from "../planChoices";
import { allowanceDate } from "../allowancePresentation";

const states: Record<string, string> = {
  preparing: "Preparing requested change", scheduled: "Scheduled plan change",
  undoing: "Cancelling requested change", awaiting_payment: "Change awaiting payment verification",
  finalizing: "Finalizing verified change", needs_review: "Requested change needs review",
};

/** Shown inside Current plan, independently of the selected subscription tab. */
export function PendingPlanChange() {
  const account = useSubscription();
  const change = account.changes.change;
  const controller = usePlanChangeDialog(account, account.busy, account.perform);
  const pending = hasPendingPlanChange(change);
  const price = change && /^\d+(?:\.\d{1,2})?$/.test(change.price) && Number.isFinite(Number(change.price)) && /^[A-Za-z]{3}$/.test(change.currency)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: change.currency.toUpperCase() }).format(Number(change.price))
    : "Price unavailable";
  return <Box sx={{ mt: pending || controller.notice ? 2 : 0 }}>
    {pending && change && <Alert severity={change.error || change.state === "needs_review" ? "warning" : "info"}
      sx={{ "& .MuiAlert-message": { width: "100%", minWidth: 0 }, overflowWrap: "anywhere" }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" component="h3">{states[change.state] ?? "Requested plan change"}</Typography>
        <Typography variant="body2">
          {change.plan_name} · {price} / {change.interval === "annual" ? "year" : "month"} · Requested renewal: {allowanceDate(change.effective_at)}.
        </Typography>
        {change.state === "scheduled" && <Typography variant="body2">
          {Date.parse(change.effective_at) > Date.now()
            ? "Your current plan continues until renewal under its existing payment terms. No charge is made now; higher-plan benefits require verified renewal payment."
            : "The requested renewal time has arrived. Review the latest billing status; higher-plan benefits require verified renewal payment."}
        </Typography>}
        {change.state === "undoing" && <Typography variant="body2">Cancellation is being confirmed. Do not submit another plan change yet.</Typography>}
        {change.state === "awaiting_payment" && <Typography variant="body2">The renewal change is awaiting verified payment. Review Billing and invoices for any action required; scheduling alone does not grant higher benefits.</Typography>}
        {change.error && <Typography variant="body2">{change.error}</Typography>}
        {(change.state === "scheduled" || change.state === "preparing" || change.state === "undoing") && <Typography variant="body2">
          Cancelling this requested change keeps your current plan and billing interval; it does not cancel your subscription.
          To downgrade to a different plan, cancel this request first and wait for confirmation, then select the new plan.
        </Typography>}
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          {change.state === "scheduled" && <Button variant="outlined" disabled={account.busy || controller.busy || !canCancelPlanChange(change)}
            onClick={() => controller.cancelChange(change)}>Cancel requested change</Button>}
          <Button component={Link} to="#changes">Review change details</Button>
        </Stack>
        {change.state === "scheduled" && !canCancelPlanChange(change) && <Typography variant="caption">
          This request cannot currently be cancelled. Cancellation closes during the final 30 seconds before renewal. Refresh billing to check its status.
        </Typography>}
      </Stack>
    </Alert>}
    {controller.notice && <Alert severity="info" role="status" sx={{ mt: 1 }}>{controller.notice}</Alert>}
    {!controller.reviewing && controller.error && <Alert severity="error" sx={{ mt: 1 }}>{controller.error}</Alert>}
    {controller.dialog}
  </Box>;
}
