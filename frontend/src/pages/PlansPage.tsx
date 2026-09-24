import { useCallback, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
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
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { MarketingHeader } from "../components/MarketingHeader";
import { AppHeader } from "../components/AppHeader";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { usePollingResource } from "../hooks/usePollingResource";
import { subscriptionsApi } from "../api/subscriptions";
import { isCurrentPlan } from "../subscriptionPresentation";
import type { PublicPlan as Plan } from "../types/subscription";
export function PlansPage({ enrolment = false, workspace = false }: { enrolment?: boolean; workspace?: boolean }) {
  const { user } = useAuth();
  return (
    <PlansContent key={`${user?.id ?? "public"}:${enrolment}`} enrolment={enrolment} workspace={workspace || enrolment} />
  );
}
function PlansContent({ enrolment, workspace }: { enrolment: boolean; workspace: boolean }) {
  const navigate = useNavigate();
  const [selectedCode, setSelectedCode] = useState("free");
  const { user, isInitializing } = useAuth();
  const catalogue = usePollingResource(
    enrolment ? subscriptionsApi.enrolmentPlans : subscriptionsApi.plans,
  );
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
  const selectedPlan = plans?.find((plan) => plan.code === selectedCode);
  const canChoosePaidPlan = (plan: Plan) =>
    !isInitializing && !busy && !!billing?.checkout_allowed &&
    !billingError && !error &&
    (interval !== "annual" || plan.annual_price !== null);
  const canContinue = !!selectedPlan && !busy &&
    (selectedPlan.billing_type === "free" || canChoosePaidPlan(selectedPlan));
  if (enrolment && access &&
      (access.billing_type === "stripe" || access.mode === "complimentary")) {
    return <Navigate to="/radar/subscription" replace />;
  }
  return (
    <Box>
      {workspace ? <AppHeader /> : <MarketingHeader />}
      <Container component="main" maxWidth="lg" sx={{ py: 6 }}>
        <Chip
          label={catalogue.data?.sandbox ? "Sandbox subscriptions" : "Subscriptions"}
          color="primary"
          variant="outlined"
        />
        <Typography component="h1" variant="h3" sx={{ my: 2 }}>
          {enrolment ? "Choose your first research plan" : "Choose your research plan"}
        </Typography>
        {enrolment && (
          <Typography sx={{ mb: 2 }}>
            Your account is ready. Free is preselected and needs no payment details.
            You can choose a paid plan now or upgrade later.
          </Typography>
        )}
        <Alert severity="info" sx={{ mb: 3 }}>
          Free is managed by Radar and assigned after registration. Prices include tax.
          {catalogue.data?.sandbox && " Paid subscriptions are in sandbox testing: use Stripe test payment details only. No real payment is collected."}
        </Alert>
        {error && (
          <Alert severity="error" action={
            <Button onClick={() => void catalogue.refresh()}>Retry</Button>
          }>
            {error}
          </Alert>
        )}
        {billingError && (
          <Alert severity="error">
            {billingError}{" "}
            <Button component={Link} to="/radar/subscription">
              Review billing
            </Button>
            <Button onClick={() => {
              setActionError("");
              void account.refresh();
              void catalogue.refresh();
            }}>
              Retry
            </Button>
          </Alert>
        )}
        {billing?.reason && (
          <Alert severity="info" sx={{ my: 2 }}>
            {billing.reason}{" "}
            <Button component={Link} to="/radar/subscription">
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
          component={enrolment ? RadioGroup : "div"}
          {...(enrolment ? {
            "aria-label": "Registration plan",
            value: selectedCode,
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              setSelectedCode(event.target.value);
              setActionError("");
            },
          } : {})}
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
              sx={{
                p: 3, border: 1, borderRadius: 3,
                borderColor: enrolment && selectedCode === plan.code
                  ? "primary.main" : "divider",
              }}
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
                {enrolment ? (
                  <FormControlLabel
                    value={plan.code}
                    control={<Radio />}
                    label={`Select ${plan.name}`}
                    disabled={busy || (plan.billing_type !== "free" && !canChoosePaidPlan(plan))}
                  />
                ) : plan.billing_type === "free" ? (
                  <Button
                    component={Link}
                    to={user ? "/radar/subscription" : "/radar/register"}
                    variant="outlined"
                  >
                    {user ? "Review subscription" : "Create a free account"}
                  </Button>
                ) : !user && !isInitializing ? (
                  <Button component={Link} to="/radar/login" variant="outlined">
                    Sign in to continue
                  </Button>
                ) : user &&
                  billing?.attempt &&
                  !billing.checkout_allowed &&
                  !billing.resume_allowed ? (
                  <Button
                    component={Link}
                    to="/radar/subscription#plans"
                    variant="outlined"
                  >
                    {isCurrentPlan(plan, access, billing)
                      ? "Manage current plan"
                      : "Review plan changes"}
                  </Button>
                ) : billing?.resume_allowed ? (
                  <Button
                    component={Link}
                    to="/radar/subscription#billing"
                    variant="outlined"
                  >
                    Resume existing checkout
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    disabled={!canChoosePaidPlan(plan)}
                    onClick={() => setSelection({ plan, interval })}
                  >
                    Choose {plan.name}
                  </Button>
                )}
              </Stack>
            </Box>
          ))}
        </Box>
        {enrolment && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Button
              variant="contained" size="large" disabled={!canContinue}
              onClick={() => {
                if (!selectedPlan || !canContinue) return;
                if (selectedPlan.billing_type === "free") {
                  navigate("/radar", { replace: true });
                } else {
                  setSelection({ plan: selectedPlan, interval });
                }
              }}
            >
              {selectedPlan?.billing_type === "free" ? "Continue with Free" : "Continue to checkout"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Choosing a paid plan opens checkout. Your Free access remains until payment is verified.
              If you cancel checkout, you can continue using Free from Subscription and usage.
            </Typography>
          </Stack>
        )}
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
          <DialogTitle>Continue to {catalogue.data?.sandbox ? "sandbox " : ""}checkout?</DialogTitle>
          <DialogContent>
            {selection && (
              <Typography>
                {selection.plan.name}:{" "}
                {money(selection.plan, selection.interval)} per{" "}
                {selection.interval === "annual" ? "year" : "month"}, tax
                included. This subscription renews until canceled. Access
                starts after invoice verification.
                {catalogue.data?.sandbox && " Use test payment details only."}
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
