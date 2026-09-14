import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { MarketingHeader } from "../components/MarketingHeader";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { usePollingResource } from "../hooks/usePollingResource";
import { subscriptionsApi } from "../api/subscriptions";
import { isCurrentPlan } from "../subscriptionPresentation";
import type { PublicPlan as Plan } from "../types/subscription";
export function PlansPage() {
  const { user } = useAuth();
  return <PlansContent key={user?.id ?? "public"} />;
}
function PlansContent() {
  const { user, isInitializing } = useAuth();
  const catalogue = usePollingResource(subscriptionsApi.plans);
  const loadAccount = useCallback(async () => {
    if (!user) return null;
    const [billing, access] = await Promise.all([
      subscriptionsApi.billing(),
      subscriptionsApi.access(),
    ]);
    return { billing, access };
  }, [user?.id]);
  const account = usePollingResource(loadAccount);
  const plans = catalogue.data?.items ?? null;
  const billing = account.data?.billing ?? null;
  const access = account.data?.access ?? null;
  const error = catalogue.error;
  const [actionError, setActionError] = useState("");
  const billingError = account.error || actionError;
  const [interval, setInterval] = useState("monthly");
  const [selection, setSelection] = useState<{
    plan: Plan;
    interval: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (p: Plan, period: string) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: p.currency,
    }).format(Number(period === "annual" ? p.annual_price : p.monthly_price));
  async function checkout() {
    if (
      !selection ||
      selection.plan.billing_type === "free" ||
      busy ||
      !billing?.checkout_allowed ||
      billingError
    )
      return;
    setBusy(true);
    try {
      const { url } = await subscriptionsApi.checkout({
        code: selection.plan.code,
        revision: selection.plan.revision,
        interval: selection.interval,
      });
      window.location.assign(url);
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? e.message
          : "Checkout could not start. Review billing status before retrying.",
      );
      setSelection(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box>
      <MarketingHeader />
      <Container component="main" maxWidth="lg" sx={{ py: 6 }}>
        <Chip
          label="Sandbox subscriptions"
          color="primary"
          variant="outlined"
        />
        <Typography component="h1" variant="h3" sx={{ my: 2 }}>
          Choose your research plan
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          Free is managed by Radar and assigned after registration. Paid
          subscriptions are still in sandbox testing: use Stripe test payment
          details only. Prices include tax; no real payment is collected.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {billingError && (
          <Alert severity="error">
            {billingError}{" "}
            <Button component={Link} to="/subscription">
              Review billing
            </Button>
          </Alert>
        )}
        {billing?.reason && (
          <Alert severity="info" sx={{ my: 2 }}>
            {billing.reason}{" "}
            <Button component={Link} to="/subscription">
              Subscription and billing
            </Button>
          </Alert>
        )}
        <TextField
          select
          label="Billing interval"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          sx={{ my: 3, minWidth: 220 }}
        >
          <MenuItem value="monthly">Monthly</MenuItem>
          <MenuItem value="annual">Annual</MenuItem>
        </TextField>
        {!plans && !error && (
          <Typography role="status">Loading plans…</Typography>
        )}
        {plans?.length === 0 && (
          <Typography>
            No subscription plans are available yet. Please check back later.
          </Typography>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 3,
          }}
        >
          {plans?.map((plan) => (
            <Box
              component="section"
              key={plan.code}
              sx={{ p: 3, border: 1, borderColor: "divider", borderRadius: 3 }}
            >
              <Stack spacing={2}>
                <Typography component="h2" variant="h5">
                  {plan.name}
                </Typography>
                {isCurrentPlan(plan, access, billing) && (
                  <Chip
                    label="Current plan"
                    color="success"
                    variant="outlined"
                    sx={{ alignSelf: "flex-start" }}
                  />
                )}
                <Typography>{plan.description}</Typography>
                <Typography variant="h4">
                  {plan.billing_type === "free"
                    ? "Free"
                    : interval === "annual" && plan.annual_price === null
                      ? "Unavailable"
                      : money(plan, interval)}
                </Typography>
                <Typography>
                  {plan.billing_type === "free"
                    ? "No payment details or checkout required."
                    : `Per ${interval === "annual" ? "year" : "month"}, tax included.`}
                </Typography>
                <Typography>
                  {plan.max_digests} digests · Up to {plan.max_papers_per_run}{" "}
                  papers per run
                </Typography>
                <Typography>
                  {plan.runs_per_month} runs per allowance month, including up
                  to {plan.manual_runs_per_month} manual runs ·{" "}
                  {plan.papers_per_month} papers total
                </Typography>
                <Typography>
                  Schedules:{" "}
                  {plan.schedule_frequencies.join(", ") || "not included"}.
                  Email delivery:{" "}
                  {plan.email_delivery ? "included" : "not included"}.
                </Typography>
                {plan.billing_type === "free" ? (
                  <Button
                    component={Link}
                    to={user ? "/subscription" : "/register"}
                    variant="outlined"
                  >
                    {user ? "Review subscription" : "Create a free account"}
                  </Button>
                ) : !user && !isInitializing ? (
                  <Button component={Link} to="/login" variant="outlined">
                    Sign in to continue
                  </Button>
                ) : user &&
                  billing?.attempt &&
                  !billing.checkout_allowed &&
                  !billing.resume_allowed ? (
                  <Button
                    component={Link}
                    to="/subscription#plans"
                    variant="outlined"
                  >
                    {isCurrentPlan(plan, access, billing)
                      ? "Manage current plan"
                      : "Review plan changes"}
                  </Button>
                ) : billing?.resume_allowed ? (
                  <Button
                    component={Link}
                    to="/subscription#billing"
                    variant="outlined"
                  >
                    Resume existing checkout
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={
                      isInitializing ||
                      !billing?.checkout_allowed ||
                      !!billingError ||
                      !!error ||
                      busy ||
                      (interval === "annual" && plan.annual_price === null)
                    }
                    onClick={() => setSelection({ plan, interval })}
                  >
                    Choose {plan.name}
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Box>
        <Typography sx={{ mt: 3 }}>
          Research allowances reset on your account’s monthly anniversary,
          including annual subscriptions. Plan changes preserve that date and
          already used allowance; unused allowance does not roll over. Eligible
          paid upgrades take effect after the prorated payment is verified.
          Downgrades and monthly/yearly switches take effect at renewal.
          Existing subscriptions keep their purchased revision; the catalogue
          shows the latest published terms.
        </Typography>
        <Dialog
          open={!!selection}
          onClose={() => {
            if (!busy) setSelection(null);
          }}
        >
          <DialogTitle>Continue to sandbox checkout?</DialogTitle>
          <DialogContent>
            {selection && (
              <Typography>
                {selection.plan.name}:{" "}
                {money(selection.plan, selection.interval)} per{" "}
                {selection.interval === "annual" ? "year" : "month"}, tax
                included. This test subscription renews until canceled. Access
                starts after invoice verification. Use test payment details
                only.
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setSelection(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy || !billing?.checkout_allowed || !!billingError || !!error
              }
              onClick={() => void checkout()}
            >
              Continue to Stripe
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
