import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { MarketingHeader } from "../components/MarketingHeader";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, ApiError } from "../api/client";
import { startPagePolling } from "../pagePolling";
import type { BillingStatus } from "../components/SubscriberBilling";
type Plan = { code: string; revision: number; name: string; description: string; currency: string; monthly_price: string; annual_price: string | null;
  max_digests: number; max_papers_per_run: number; papers_per_month: number; runs_per_month: number; manual_runs_per_month: number;
  schedule_frequencies: string[]; email_delivery: boolean };
export function PlansPage() {
  const { user, isInitializing } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [interval, setInterval] = useState("monthly");
  const [selection, setSelection] = useState<{ plan: Plan; interval: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = startPagePolling(async () => {
      try { const r = await apiRequest<{ items: Plan[] }>("/subscription/plans", { authenticate: false }); if (active) { setPlans(r.items); setError(""); } }
      catch (e) { if (active) setError(e instanceof ApiError ? e.message : "Could not load plans. Trying again shortly."); }
    }, 10000);
    return () => { active = false; stop(); };
  }, []);
  useEffect(() => {
    setBilling(null); setBillingError("");
    if (!user) return;
    let active = true;
    const stop = startPagePolling(async () => {
      try { const r = await apiRequest<BillingStatus>("/subscription/billing"); if (active) { setBilling(r); setBillingError(""); } }
      catch (e) { if (active) setBillingError(e instanceof ApiError ? e.message : "Could not check checkout availability."); }
    }, 10000);
    return () => { active = false; stop(); };
  }, [user?.id]);
  const money = (p: Plan, period: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(Number(period === "annual" ? p.annual_price : p.monthly_price));
  async function checkout() {
    if (!selection || busy || !billing?.checkout_allowed || billingError) return;
    setBusy(true);
    try {
      const { url } = await apiRequest<{ url: string }>("/subscription/billing/checkout", { method: "POST", body: {
        code: selection.plan.code, revision: selection.plan.revision, interval: selection.interval,
      } });
      window.location.assign(url);
    } catch (e) { setBillingError(e instanceof ApiError ? e.message : "Checkout could not start. Review billing status before retrying."); setSelection(null); }
    finally { setBusy(false); }
  }
  return <Box><MarketingHeader /><Container component="main" maxWidth="lg" sx={{ py: 6 }}>
    <Chip label="Sandbox subscriptions" color="primary" variant="outlined" />
    <Typography component="h1" variant="h3" sx={{ my: 2 }}>Choose your research plan</Typography>
    <Alert severity="info" sx={{ mb: 3 }}>Test subscriptions only. Prices include tax. Use Stripe test payment details; no real payment is collected. Checkout is available to accounts enrolled by an administrator.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {billingError && <Alert severity="error">{billingError} <Button component={Link} to="/subscription">Review billing</Button></Alert>}
    {billing?.reason && <Alert severity="info" sx={{ my: 2 }}>{billing.reason} <Button component={Link} to="/subscription">Subscription and billing</Button></Alert>}
    <TextField select label="Billing interval" value={interval} onChange={e => setInterval(e.target.value)} sx={{ my: 3, minWidth: 220 }}>
      <MenuItem value="monthly">Monthly</MenuItem><MenuItem value="annual">Annual</MenuItem>
    </TextField>
    {!plans && !error && <Typography role="status">Loading plans…</Typography>}
    {plans?.length === 0 && <Typography>No subscription plans are available yet. Please check back later.</Typography>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 3 }}>
      {plans?.map(plan => <Box component="section" key={plan.code} sx={{ p: 3, border: 1, borderColor: "divider", borderRadius: 3 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h5">{plan.name}</Typography><Typography>{plan.description}</Typography>
          <Typography variant="h4">{interval === "annual" && plan.annual_price === null ? "Unavailable" : money(plan, interval)}</Typography>
          <Typography>Per {interval === "annual" ? "year" : "month"}, tax included.</Typography>
          <Typography>{plan.max_digests} digests · Up to {plan.max_papers_per_run} papers per run</Typography>
          <Typography>{plan.runs_per_month} runs per allowance month, including up to {plan.manual_runs_per_month} manual runs · {plan.papers_per_month} papers total</Typography>
          <Typography>Schedules: {plan.schedule_frequencies.join(", ") || "not included"}. Email delivery: {plan.email_delivery ? "included" : "not included"}.</Typography>
          {!user && !isInitializing ? <Button component={Link} to="/login" variant="outlined">Sign in to continue</Button> :
            <Button variant="contained" disabled={isInitializing || !billing?.checkout_allowed || !!billingError || !!error || busy || (interval === "annual" && plan.annual_price === null)}
              onClick={() => setSelection({ plan, interval })}>Choose {plan.name}</Button>}
        </Stack>
      </Box>)}
    </Box>
    <Typography sx={{ mt: 3 }}>Allowances reset monthly on your subscription anniversary, including annual subscriptions. Unused allowance does not roll over. Existing subscribers can manage billing; upgrades and downgrades will be added later.</Typography>
    <Dialog open={!!selection} onClose={() => { if (!busy) setSelection(null); }}>
      <DialogTitle>Continue to sandbox checkout?</DialogTitle><DialogContent>
        {selection && <Typography>{selection.plan.name}: {money(selection.plan, selection.interval)} per {selection.interval === "annual" ? "year" : "month"}, tax included. This test subscription renews until canceled. Access starts after invoice verification. Use test payment details only.</Typography>}
      </DialogContent><DialogActions><Button disabled={busy} onClick={() => setSelection(null)}>Cancel</Button>
        <Button disabled={busy || !billing?.checkout_allowed || !!billingError || !!error} onClick={() => void checkout()}>Continue to Stripe</Button></DialogActions>
    </Dialog>
  </Container></Box>;
}
