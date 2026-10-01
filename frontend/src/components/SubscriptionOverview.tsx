import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { useSubscription } from "./SubscriptionData";
import { allowanceDate, allowanceText } from "../allowancePresentation";
import { subscriptionAction } from "../subscriptionPresentation";
import { allowanceCard, currentBillingInterval, usageNumber } from "../usagePresentation";
export const subscriptionDate = (value?: string | null) =>
  value ? allowanceDate(value) : "Not available";

const cardStyle = { p: { xs: 2, sm: 3 }, borderRadius: 3, minWidth: 0, overflowWrap: "anywhere" };
const noticeStyle = { "& .MuiAlert-message": { minWidth: 0, width: "100%" } };

export function SubscriptionOverview() {
  const { access, billing, changes, upgrades } = useSubscription();
  const action = subscriptionAction(access, billing, changes, upgrades);
  const scheduledChange = changes.change?.state === "scheduled" ? changes.change : null;
  const complimentary = access.mode === "complimentary";
  const renewalLabel = billing.cancel_at_period_end && access.billing_type === "stripe" ? "Paid access ends"
    : access.billing_type === "stripe" ? billing.attempt?.subscription_status === "active" ? "Next renewal" : "Billing period ends" : "Billing";
  const renewal = access.billing_type === "stripe" ? subscriptionDate(billing.period_end)
    : access.billing_type === "free" ? "No payment due for Free" : "No verified paid renewal";

  return <Stack spacing={2}>
    <Paper variant="outlined" sx={cardStyle}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography color="text.secondary">Current plan</Typography>
          <Typography variant="h4" component="h2">
            {access.plan?.name ?? (complimentary ? "Complimentary access" : "Access not verified")}
          </Typography>
          {action?.text !== access.reason && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {allowanceText(access.reason)}
          </Typography>}
        </Box>
        <Chip label={access.grace_until ? "Payment grace period" : access.allowed ? "Research access active" : "Action required"}
          color={access.allowed && !access.grace_until ? "success" : "warning"} variant="outlined"
          sx={{ alignSelf: "flex-start", maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }} />
      </Stack>
      <Box component="dl" sx={{ m: 0, mt: 3, display: "grid", gap: 2.5,
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(3, minmax(0, 1fr))" } }}>
        {[
          ["Billing interval", currentBillingInterval(access, billing)],
          [renewalLabel, renewal],
          ["Monthly allowance reset", complimentary ? "No subscription allowance limit" : subscriptionDate(access.period_end)],
        ].map(([title, value]) => <Box key={title} sx={{ minWidth: 0 }}>
          <Typography component="dt" variant="body2" color="text.secondary">{title}</Typography>
          <Typography component="dd" sx={{ m: 0, mt: 0.5, fontWeight: 650 }}>{value}</Typography>
        </Box>)}
      </Box>
      {!complimentary && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Research allowances reset monthly, including with yearly billing. The allowance reset is separate from payment renewal.
      </Typography>}
      {billing.cancel_at_period_end && access.billing_type === "stripe" && <Alert severity="info" sx={{ mt: 2, ...noticeStyle }}>
        Renewal is cancelled. Free applies after verified paid access ends; saved research is retained.
      </Alert>}
      {scheduledChange && <Alert severity="info" sx={{ mt: 2, ...noticeStyle }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700}>Scheduled plan change</Typography>
            <Typography variant="body2">{scheduledChange.plan_name} ({scheduledChange.interval === "annual" ? "yearly" : "monthly"}) starts
              at renewal on {subscriptionDate(scheduledChange.effective_at)}.</Typography>
          </Box>
          <Button component={Link} to="#changes" sx={{ minHeight: 44, flexShrink: 0 }}>Review or undo</Button>
        </Stack>
      </Alert>}
      {action && <Alert severity="warning" sx={{ mt: 2, ...noticeStyle }}>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}>
          <Typography variant="body2" sx={{ minWidth: 0 }}>{allowanceText(action.text)}</Typography>
          <Button component={Link} to={action.hash} variant="outlined" sx={{ minHeight: 44, flexShrink: 0, maxWidth: "100%", whiteSpace: "normal" }}>{action.label}</Button>
        </Stack>
      </Alert>}
    </Paper>

    <Paper variant="outlined" sx={cardStyle}>
      <Typography variant="h6" component="h2" gutterBottom>Remaining allowances</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Remaining amounts are reported by Radar and already account for reservations. They are not a guarantee that every run can start; current access and per-run limits also apply.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 2 }}>
        {([
          ["runs", "Total runs"], ["manual_runs", "Manual runs"], ["papers", "Papers"], ["digests", "Available digest slots"],
        ] as const).map(([key, title]) => {
          const display = allowanceCard(access, key);
          const capacity = key === "digests";
          return <Box component="section" key={key} aria-label={title} sx={{ p: 2, border: 1,
            borderColor: capacity ? "primary.main" : "divider", borderRadius: 2, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">{capacity ? "Saved-digest capacity" : "Monthly research allowance"}</Typography>
            <Typography component="h3" variant="subtitle1" fontWeight={700}>{title}</Typography>
            <Typography component="p" variant={typeof access.remaining[key] === "number" ? "h4" : "h6"}
              sx={{ my: 1, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{display.remaining}</Typography>
            <Typography variant="body2" color="text.secondary">
              {display.limit !== null ? `${capacity ? "Available slots; plan capacity" : "Remaining; included per month"}: ${usageNumber(display.limit)}`
                : complimentary ? "Other service rate limits still apply." : "Plan limit is not verified."}
            </Typography>
            {display.state && <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 650 }}>{display.state}</Typography>}
            <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
              {key === "runs" && <>
                <Typography variant="body2">Completed: {usageNumber(access.usage.completed_runs)}</Typography>
                <Typography variant="body2">Reserved: {usageNumber(access.usage.reserved_runs)}</Typography>
              </>}
              {key === "papers" && <>
                <Typography variant="body2">Completed: {usageNumber(access.usage.completed_papers)}</Typography>
                <Typography variant="body2">Reserved: {usageNumber(access.usage.reserved_papers)}</Typography>
              </>}
              {key === "manual_runs" && <>
                <Typography variant="body2">Counted: {usageNumber(access.usage.manual_runs)}</Typography>
                <Typography variant="caption" color="text.secondary">Completed and reserved manual runs combined. Included in total runs, not additional runs.</Typography>
              </>}
              {capacity && <>
                <Typography variant="body2">Active digests: {usageNumber(access.digest_count)}</Typography>
                <Typography variant="body2">Saved digests retained: {usageNumber(access.retained_digest_count)}</Typography>
                <Typography variant="caption" color="text.secondary">Digest slots do not reset monthly.</Typography>
                <Button component={Link} to="#digests" size="small" sx={{ display: "flex", minHeight: 44 }}>Manage active digests</Button>
              </>}
            </Box>
          </Box>;
        })}
      </Box>
      <Typography variant="body2" sx={{ mt: 2 }}>
        Reserved usage is held for accepted work that has not settled yet, not completed research. Do not subtract it from the remaining amounts again.
        Plan changes preserve your reset date and already used allowance; unused monthly allowance does not roll over.
      </Typography>
      {access.plan && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Up to {access.plan.configuration.max_papers_per_run} papers per run. Included schedules: {access.plan.configuration.schedule_frequencies.map(value => value.charAt(0).toUpperCase() + value.slice(1)).join(", ") || "none"}.
        Email delivery: {access.plan.configuration.email_delivery ? "included" : "not included"}.
      </Typography>}
    </Paper>
  </Stack>;
}
