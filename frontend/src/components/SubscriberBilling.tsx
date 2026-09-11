import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, ApiError } from "../api/client";
import { startPagePolling } from "../pagePolling";
export type BillingStatus = { checkout_allowed: boolean; resume_allowed: boolean; portal_allowed: boolean; reason: string;
  attempt: { plan_name: string; code: string; revision: number; interval: string; checkout_status: string; subscription_status: string | null } | null };
export function SubscriberBilling() {
  const [params] = useSearchParams();
  const [data, setData] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = startPagePolling(async () => {
      try { const result = await apiRequest<BillingStatus>("/subscription/billing"); if (active) { setData(result); setError(""); } }
      catch (e) { if (active) setError(e instanceof ApiError ? e.message : "Could not load billing status."); }
    }, 10000);
    return () => { active = false; stop(); };
  }, []);
  async function action(name: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (name === "refresh") setData(await apiRequest<BillingStatus>("/subscription/billing/refresh", { method: "POST" }));
      else {
        const { url } = await apiRequest<{ url: string }>(`/subscription/billing/${name}`, { method: "POST" });
        window.location.assign(url);
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not open billing. Try again."); }
    finally { setBusy(false); }
  }
  return <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
    <Typography variant="h6">Manage subscription</Typography>
    <Alert severity="info">Sandbox testing only. Use Stripe test payment details; no real payment is collected.</Alert>
    {params.has("stripe_return") && <Alert severity="info">You have returned from Stripe. Your access updates after payment verification. Returning here does not confirm payment. You can refresh billing status below.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {!data && !error && <Typography role="status">Loading billing…</Typography>}
    {data && <>
      {data.attempt && <Typography>{data.attempt.plan_name} · {data.attempt.interval} · {data.attempt.subscription_status ?? data.attempt.checkout_status}</Typography>}
      {data.reason && <Typography>{data.reason}</Typography>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button component={Link} to="/plans">Compare plans</Button>
        {data.resume_allowed && <Button disabled={busy || !!error} onClick={() => void action("resume")}>Resume checkout</Button>}
        <Button disabled={busy || !data.portal_allowed || !!error} onClick={() => void action("portal")}>Manage billing</Button>
        <Button disabled={busy} onClick={() => void action("refresh")}>{busy ? "Please wait…" : "Refresh billing status"}</Button>
      </Stack>
      {!data.portal_allowed && <Typography variant="body2">Billing management becomes available after a customer is established and the billing portal is configured.</Typography>}
    </>}
  </Stack></Paper>;
}
