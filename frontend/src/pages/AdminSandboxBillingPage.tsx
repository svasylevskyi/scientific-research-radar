import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Container, Paper, Stack, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type Attempt = { id: string; plan_revision_id: number; revision: number; interval: string; checkout_status: string;
  subscription_status: string | null; cancel_at_period_end: boolean; price_matches: boolean;
  period_end: string | null; observed_at: string | null; created_at: string };
type Overview = { enabled: boolean; portal_available: boolean; attempts: Attempt[];
  plan: { revision: number; configuration: { name: string; state: string; currency: string;
    monthly_price: string; annual_price: string | null; stripe_sandbox?: unknown } } | null };
const path = "/admin/subscription-testing";
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not available yet";
const label = (value: string) => value.replaceAll("_", " ");

export function AdminSandboxBillingPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await apiRequest<Overview>(path);
        if (active) { setData(result); setLoadError(""); }
      } catch { if (active) setLoadError("Could not load sandbox billing status. Retrying shortly."); }
      if (active) timer = setTimeout(poll, 10000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  async function action(kind: "checkout" | "portal" | "refresh", interval?: string, revision?: number) {
    setBusy(true); setError("");
    try {
      if (kind === "refresh") setData(await apiRequest<Overview>(path + "/refresh", { method: "POST" }));
      else {
        const result = await apiRequest<{ url: string }>(path + "/" + kind, { method: "POST",
          ...(kind === "checkout" ? { body: { interval, revision: revision ?? data?.plan?.revision } } : {}) });
        window.location.assign(result.url);
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not complete the sandbox operation."); }
    finally { setBusy(false); }
  }
  const latest = data?.attempts[0];
  const subscribed = !!latest?.subscription_status && !["canceled", "incomplete_expired"].includes(latest.subscription_status);
  const pending = latest && ["creating", "open"].includes(latest.checkout_status) && !subscribed;
  const config = data?.plan?.configuration;
  return <Box><AppHeader /><Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
    <Button component={Link} to="/admin/subscription-plans" sx={{ mb: 2 }}>Back to plans</Button>
    <Button component={Link} to="/admin/billing-sync" sx={{ mb: 2 }}>Synchronization status</Button>
    <Typography component="h1" variant="h3" gutterBottom>Sandbox billing</Typography>
    <Alert severity="info" sx={{ mb: 3 }}>For administrators testing their own Explorer subscription. Use Stripe test cards only.
      No real money is collected and Radar access and allowances are unchanged. Automatic tax calculation and trials are not enabled in this test.</Alert>
    {params.has("stripe_return") && <Alert severity="info" sx={{ mb: 2 }}>You have returned from Stripe. The status below is updated by verified Stripe events;
      returning here does not confirm a payment. You can also refresh directly from Stripe.</Alert>}
    {loadError && <Alert severity="warning" sx={{ mb: 2 }}>{loadError}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!data && <Typography role="status">Loading sandbox billing…</Typography>}
    {data && <Stack spacing={3}>
      {!data.enabled && <Alert severity="warning">Sandbox checkout is disabled. Complete the server setup before testing.</Alert>}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Explorer checkout</Typography>
        {config ? <>
          <Typography gutterBottom>{config.name} · revision {data.plan?.revision} · {config.state}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Advertised prices include tax. Stripe prices are checked again before each new checkout.</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" disabled={busy || !data.enabled || subscribed || !!pending || config.state === "archived" || !config.stripe_sandbox}
              onClick={() => void action("checkout", "monthly")}>Test monthly · {config.currency} {config.monthly_price}</Button>
            {config.annual_price && <Button variant="outlined" disabled={busy || !data.enabled || subscribed || !!pending || config.state === "archived" || !config.stripe_sandbox}
              onClick={() => void action("checkout", "annual")}>Test annual · {config.currency} {config.annual_price}</Button>}
          </Stack>
          {pending && <Typography sx={{ mt: 2 }}>A checkout is pending. Resume it below, or refresh after its one-hour expiry before starting another.</Typography>}
          {subscribed && <Typography sx={{ mt: 2 }}>A sandbox subscription already exists. Use the billing portal to manage or cancel it.</Typography>}
        </> : <Typography>Save an Explorer plan with a sandbox mapping in Plans first.</Typography>}
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Your latest sandbox subscription</Typography>
        {latest ? <Stack spacing={1}>
          <Box><Chip label={label(latest.subscription_status ?? latest.checkout_status)} /></Box>
          <Typography>Checkout: {label(latest.checkout_status)} · {latest.interval}</Typography>
          <Typography>Current billing period ends: {date(latest.period_end)}</Typography>
          {latest.cancel_at_period_end && <Alert severity="info">Cancellation is scheduled for the end of the current billing period.</Alert>}
          {!latest.price_matches && <Alert severity="warning">The Stripe subscription no longer matches its saved Radar price. Review changes in the sandbox.</Alert>}
          <Typography color="text.secondary">Last verified with Stripe: {date(latest.observed_at)}</Typography>
        </Stack> : <Typography>No sandbox checkout has been started by your account.</Typography>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
          {pending && <Button variant="contained" disabled={busy || !data.enabled}
            onClick={() => void action("checkout", latest.interval, latest.revision)}>Resume checkout</Button>}
          <Button disabled={busy || !latest} onClick={() => void action("refresh")}>Refresh from Stripe</Button>
          <Button variant="outlined" disabled={busy || !data.enabled || !data.portal_available} onClick={() => void action("portal")}>Open billing portal</Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Recent sandbox attempts</Typography>
        {!data.attempts.length ? <Typography>No attempts yet.</Typography> : data.attempts.map(attempt =>
          <Box key={attempt.id} sx={{ py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography>{date(attempt.created_at)} · {attempt.interval} · {label(attempt.subscription_status ?? attempt.checkout_status)}</Typography>
            <Typography variant="body2" color="text.secondary">Attempt {attempt.id}</Typography>
          </Box>)}
      </Paper>
    </Stack>}
  </Container></Box>;
}
