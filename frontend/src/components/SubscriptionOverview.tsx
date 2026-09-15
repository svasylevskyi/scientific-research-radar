import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { useSubscription } from "./SubscriptionData";
import { allowanceDate, allowanceText } from "../allowancePresentation";
import { subscriptionAction } from "../subscriptionPresentation";
export const subscriptionDate = (value?: string | null) =>
  value ? allowanceDate(value) : "Not available";
export function SubscriptionOverview() {
  const { access, billing, changes, upgrades } = useSubscription();
  const action = subscriptionAction(access, billing, changes, upgrades);
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography color="text.secondary">Current plan</Typography>
            <Typography variant="h4" component="h2">
              {access.plan?.name ??
                (access.mode === "complimentary"
                  ? "Complimentary access"
                  : "Access not verified")}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {action?.text !== access.reason && allowanceText(access.reason)}
            </Typography>
          </Box>
          <Chip
            label={
              access.grace_until
                ? "Payment grace period"
                : access.allowed
                  ? "Research access active"
                  : "Action required"
            }
            color={
              access.allowed && !access.grace_until ? "success" : "warning"
            }
            variant="outlined"
          />
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={3}
          sx={{ mt: 3 }}
        >
          <Box>
            <Typography color="text.secondary">
              {billing.cancel_at_period_end && access.billing_type === "stripe"
                ? "Paid access ends"
                : access.billing_type === "stripe"
                  ? billing.attempt?.subscription_status === "active"
                    ? "Next renewal"
                    : "Billing period ends"
                  : "Billing"}
            </Typography>
            <Typography>
              {access.billing_type === "stripe"
                ? subscriptionDate(billing.period_end)
                : access.billing_type === "free"
                  ? "Free — no subscription payment"
                  : "No verified paid renewal"}
            </Typography>
          </Box>
          <Box>
            <Typography color="text.secondary">
              Monthly allowance reset
            </Typography>
            <Typography>
              {access.mode === "complimentary"
                ? "No subscription allowance limit"
                : subscriptionDate(access.period_end)}
            </Typography>
          </Box>
        </Stack>
        {billing.cancel_at_period_end && access.billing_type === "stripe" && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Renewal is cancelled. Free applies after verified paid access ends;
            saved research is retained.
          </Alert>
        )}
      </Paper>
      {changes.change?.state === "scheduled" && (
        <Alert
          severity="info"
          action={
            <Button component={Link} to="#changes">
              Review or undo
            </Button>
          }
        >
          {changes.change.plan_name} (
          {changes.change.interval === "annual" ? "yearly" : "monthly"}) starts
          at renewal on {subscriptionDate(changes.change.effective_at)}.
        </Alert>
      )}
      {action && (
        <Alert
          severity="warning"
          action={
            <Button component={Link} to={action.hash}>
              {action.label}
            </Button>
          }
        >
          {allowanceText(action.text)}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Remaining allowances
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            gap: 2,
          }}
        >
          {(
            [
              ["runs", "Total runs"],
              ["manual_runs", "Manual runs"],
              ["papers", "Papers"],
              ["digests", "Available digest slots"],
            ] as const
          ).map(([key, label]) => (
            <Box key={key}>
              <Typography color="text.secondary">{label}</Typography>
              <Typography variant="h5">
                {access.remaining[key] ??
                  (access.mode === "complimentary"
                    ? "Unlimited"
                    : "Unverified")}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Manual runs are included in total runs. Digest slots do not reset
          monthly. Plan changes preserve your reset date and already used
          allowance.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Completed: {access.usage.completed_runs} runs ·{" "}
          {access.usage.completed_papers} papers. Reserved:{" "}
          {access.usage.reserved_runs} runs · {access.usage.reserved_papers}{" "}
          papers.
        </Typography>
        {access.plan && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Up to {access.plan.configuration.max_papers_per_run} papers per run.
            Schedules:{" "}
            {access.plan.configuration.schedule_frequencies.join(", ") ||
              "not included"}
            . Email delivery:{" "}
            {access.plan.configuration.email_delivery
              ? "included"
              : "not included"}
            .
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
