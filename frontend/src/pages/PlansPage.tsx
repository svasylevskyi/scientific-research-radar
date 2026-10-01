import { ResourceNotice } from "../components/ResourceNotice";
import { useCallback, useId, useState, type ChangeEvent } from "react";
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
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { MarketingHeader } from "../components/MarketingHeader";
import { AppHeader } from "../components/AppHeader";
import { BillingIntervalTabs, type BillingInterval } from "../components/BillingIntervalTabs";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { usePollingResource } from "../hooks/usePollingResource";
import { subscriptionsApi } from "../api/subscriptions";
import { isCurrentPlan } from "../subscriptionPresentation";
import { planFeatures, planPrice } from "../planPresentation";
import type { PublicPlan as Plan } from "../types/subscription";
export function PlansPage({ enrolment = false, workspace = false }: { enrolment?: boolean; workspace?: boolean }) {
  const { user } = useAuth();
  return (
    <PlansContent key={`${user?.id ?? "public"}:${enrolment}`} enrolment={enrolment} workspace={workspace || enrolment} />
  );
}
function PlansContent({ enrolment, workspace }: { enrolment: boolean; workspace: boolean }) {
  const navigate = useNavigate();
  const id = useId();
  const [selectedCode, setSelectedCode] = useState("free");
  const { user, isInitializing } = useAuth();
  const catalogue = usePollingResource(
    enrolment ? subscriptionsApi.enrolmentPlans : subscriptionsApi.plans,
  );
  const loadAccount = useCallback(async (signal: AbortSignal) => {
    if (!user) return null;
    const [billing, access] = await Promise.all([
      subscriptionsApi.billing(signal),
      subscriptionsApi.access(signal),
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
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selection, setSelection] = useState<{
    plan: Plan;
    interval: BillingInterval;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (p: Plan, period: BillingInterval) =>
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
      <Container component="main" maxWidth={false} sx={{ py: { xs: 4, sm: 6 } }}>
        <Typography variant="overline" color="primary" fontWeight={750}>
          Research that fits your routine
        </Typography>
        <Typography component="h1" variant="h3" sx={{ my: 2 }}>
          {enrolment ? "Choose your first subscription plan" : "Subscription Plans"}
        </Typography>
        <Typography color="text.secondary" sx={{ width: "100%", mb: 1 }}>
          {enrolment
            ? "Your account is ready. Free is preselected and needs no payment details. Choose a paid plan now or upgrade later."
            : "Compare research allowances, scheduling options, and email delivery to find your plan."}
        </Typography>
        {catalogue.data?.sandbox && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Paid subscriptions are in sandbox testing: use Stripe test payment details only. No real payment is collected.
          </Alert>
        )}
        <ResourceNotice {...catalogue} />
        <ResourceNotice {...account} />
        {actionError && (
          <Alert severity="error">
            {actionError}{" "}
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
          !billing.checkout_allowed || billing.resume_allowed ? (
            <Alert severity="info" sx={{ my: 2 }}>
              {billing.reason}{" "}
              <Button component={Link} to="/radar/subscription">
                Subscription and billing
              </Button>
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">{billing.reason}</Typography>
          )
        )}
        <BillingIntervalTabs value={interval} onChange={setInterval}>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: 3,
            }}
          >
            {plans?.map((plan) => {
              const price = planPrice(plan, interval);
              const current = isCurrentPlan(plan, access, billing);
              const selected = enrolment && selectedCode === plan.code;
              return (
                <Box
                  component="section"
                  key={plan.code}
                  aria-labelledby={`${id}-${plan.code}-title`}
                  sx={{
                    p: { xs: 2.5, sm: 3 }, border: 1, borderRadius: 3,
                    minWidth: 0, overflowWrap: "anywhere", bgcolor: "background.paper",
                    borderColor: selected || current ? "primary.main" : "divider",
                    display: "grid", gridTemplateRows: "auto auto auto 1fr auto", gap: 2,
                    // Shared tracks align headings, descriptions, prices, and actions
                    // within each row without truncating catalogue copy. Grid above
                    // is the equal-height, bottom-aligned fallback for older browsers.
                    "@supports (grid-template-rows: subgrid)": {
                      gridTemplateRows: "subgrid", gridRow: "span 5",
                    },
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between"
                    useFlexGap flexWrap="wrap" gap={1}>
                    <Typography id={`${id}-${plan.code}-title`} component="h2" variant="h5" fontWeight={750}>
                      {plan.name}
                    </Typography>
                    {current && <Chip label="Current plan" color="success" variant="outlined" size="small" />}
                  </Stack>
                  <Typography color="text.secondary">{plan.description}</Typography>
                  <Box data-plan-section="price">
                    <Typography component="p" variant={price.unit || plan.billing_type === "free" ? "h4" : "h6"}
                      sx={{ fontWeight: 750, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                      {price.amount}{price.unit && <Typography component="span" variant="body1" color="text.secondary">
                        {" "}{price.unit}
                      </Typography>}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{price.note}</Typography>
                    {price.monthlyEquivalent && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{price.monthlyEquivalent}</Typography>
                    )}
                    {price.savings && (
                      <Typography variant="body2" color="primary.dark" fontWeight={650} sx={{ mt: 1 }}>{price.savings}</Typography>
                    )}
                  </Box>
                  <Box component="dl" aria-label={`${plan.name} included features`} sx={{ m: 0 }}>
                    {planFeatures(plan).map((feature) => (
                      <Box key={feature.label} sx={{
                        display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                        gap: 1.5, py: 1.25, borderTop: 1, borderColor: "divider",
                      }}>
                        <Typography component="dt" variant="body2" color="text.secondary">{feature.label}</Typography>
                        <Box component="dd" sx={{ m: 0, minWidth: 0, textAlign: "right" }}>
                          <Typography variant="body2" fontWeight={650}>{feature.value}</Typography>
                          {feature.detail && <Typography variant="caption" color="text.secondary">{feature.detail}</Typography>}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  <Box data-plan-section="action" sx={{
                    display: "flex", alignItems: "flex-end",
                    "& > .MuiButton-root": { width: "100%", minHeight: 44, whiteSpace: "normal" },
                    "& > .MuiFormControlLabel-root": { m: 0, minHeight: 44 },
                  }}>
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
                  </Box>
                </Box>
              );
            })}
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
        </BillingIntervalTabs>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, width: "100%" }}>
          Research allowances reset monthly, including on Yearly plans.
          Manual runs are included in the total monthly run allowance, not added to it.
          Scheduled runs use that same total. Scheduling frequency does not increase your allowances.
        </Typography>
        <Box component="details" sx={{ mt: 2, p: { xs: 2, sm: 3 }, border: 1,
          borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
          <Box component="summary" sx={{ cursor: "pointer", fontWeight: 750,
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 } }}>
            How billing and plan changes work
          </Box>
          <Stack spacing={1.5} sx={{ mt: 2, width: "100%" }}>
            <Typography variant="body2">
              Research allowances reset on your account’s monthly anniversary, including yearly subscriptions.
              Unused allowance does not roll over. Plan changes preserve that reset date and already used allowance.
            </Typography>
            <Typography variant="body2">
              Paid subscriptions renew until canceled. Eligible paid upgrades take effect after the prorated
              payment is verified. Downgrades and monthly/yearly switches take effect at renewal.
            </Typography>
            <Typography variant="body2">
              The cards show the latest published terms. Existing subscriptions keep their purchased revision;
              review Subscription and usage for your own plan’s allowances and billing status.
            </Typography>
          </Stack>
        </Box>
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
