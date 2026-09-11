import { useEffect, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { apiRequest, ApiError } from "../api/client";
import { startPagePolling } from "../pagePolling";
type Invoice = { id: string; status: string; currency: string; amount_due: number; amount_paid: number;
  amount_remaining: number; attempt_count: number; billing_reason: string; period_start: string | null; period_end: string | null;
  paid_at: string | null; next_payment_attempt: string | null; issue: string | null; observed_at: string };
type Review = { items: Invoice[]; total: number; checked_at: string | null; history_complete: boolean;
  latest_invoice_id: string | null; discrepancies: string[];
  account_access: { mode: string; allowed: boolean; reason: string } };
const date = (s: string | null) => s ? new Date(s).toLocaleString() : "Not verified";
export function AdminInvoiceReview({ checkoutId }: { checkoutId: string }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(null);
    const stop = startPagePolling(async () => {
      try {
        const result = await apiRequest<Review>(`/admin/billing-sync/checkouts/${checkoutId}/invoices?offset=${offset}`);
        if (active) { setData(result); setError(""); }
      } catch (err) { if (active) setError(err instanceof ApiError ? err.message : "Could not load invoices."); }
    }, 10000);
    return () => { active = false; stop(); };
  }, [checkoutId, open, offset]);
  return <Box sx={{ mt: 2 }}>
    <Button onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? "Hide" : "Review"} invoices and access</Button>
    {open && <Stack spacing={1}>
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <Typography role="status">Loading invoice observations…</Typography>}
      {data && <>
        <Typography>Invoice check: {date(data.checked_at)} · Current invoice: {data.latest_invoice_id ?? "None verified"}</Typography>
        <Typography>Historical import: {data.history_complete ? "caught up" : "in progress; more pages will be checked"}.</Typography>
        <Alert severity={data.account_access.allowed ? "info" : "warning"}>Account access ({data.account_access.mode}): {data.account_access.reason}</Alert>
        {data.discrepancies.map((text, i) => <Alert severity="warning" key={i}>{text}</Alert>)}
        {!data.items.length && <Typography>No invoices stored yet. Use Reconcile now on the reconciliation job after granting the sandbox key Invoices read permission.</Typography>}
        {data.items.map(invoice => <Box key={invoice.id} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
          <Typography variant="subtitle1">{invoice.id} · {invoice.status}</Typography>
          <Typography>Currency: {invoice.currency.toUpperCase()}. Amounts in minor units: due {invoice.amount_due}, settled {invoice.amount_paid}, remaining {invoice.amount_remaining}.</Typography>
          <Typography>Reason: {invoice.billing_reason} · Payment attempts: {invoice.attempt_count}</Typography>
          <Typography>Coverage: {date(invoice.period_start)} – {date(invoice.period_end)}</Typography>
          <Typography>Settled: {date(invoice.paid_at)} · Next payment attempt: {date(invoice.next_payment_attempt)}</Typography>
          <Typography>Last observed: {date(invoice.observed_at)}</Typography>
          {invoice.issue && <Alert severity="warning">{invoice.issue}</Alert>}
        </Box>)}
        <Stack direction="row" spacing={2}><Button disabled={!offset} onClick={() => setOffset(v => Math.max(0, v - 25))}>Previous</Button>
          <Typography sx={{ alignSelf: "center" }}>{data.total} invoices</Typography>
          <Button disabled={offset + 25 >= data.total} onClick={() => setOffset(v => v + 25)}>Next</Button></Stack>
      </>}
    </Stack>}
  </Box>;
}
