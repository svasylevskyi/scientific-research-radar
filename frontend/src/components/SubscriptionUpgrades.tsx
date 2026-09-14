import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { apiRequest, ApiError } from '../api/client';
import { startPagePolling } from '../pagePolling';

type Option = { code: string; revision: number; name: string; interval: string; currency: string; price: string };
type Upgrade = { id: string; state: string; plan_name: string; interval: string; recurring_price: string; currency: string; amount_due: number; credit: number; charge: number; proration_at: string; period_end: string; expires_at: string; pending_until: string | null; error: string | null; confirm_allowed: boolean; retry_allowed: boolean; payment_allowed: boolean; limits: { max_digests: number; runs_per_month: number; manual_runs_per_month: number; papers_per_month: number; max_papers_per_run: number; schedule_frequencies: string[]; email_delivery: boolean } };
type Data = { items: Option[]; upgrade: Upgrade | null; reason: string };
const currency = (amount: number, code: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: code.toUpperCase() }).format(amount);
const key = (o: Option) => `${o.code}:${o.revision}`;
const stateText: Record<string, string> = { preview: 'Ready to review', submitting: 'Confirming upgrade with Stripe', pending_payment: 'Payment or authentication required', applied: 'Upgrade active', expired: 'Preview or pending upgrade expired', needs_review: 'Billing review required' };

export function SubscriptionUpgrades() {
  const [data, setData] = useState<Data | null>(null);
  const [selection, setSelection] = useState('');
  const [review, setReview] = useState<Upgrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const stop = startPagePolling(async () => {
      try { const result = await apiRequest<Data>('/subscription/billing/upgrades'); if (active) setData(result); }
      catch (e) { if (active) setError(e instanceof ApiError ? e.message : 'Could not load upgrades.'); }
    }, 10000);
    return () => { active = false; stop(); };
  }, []);
  async function action(name: 'preview' | 'confirm' | 'retry' | 'payment') {
    if (busy) return;
    const option = data?.items.find(o => key(o) === selection);
    const current = name === 'confirm' ? review : data?.upgrade;
    if ((name === 'preview' && !option) || (name !== 'preview' && !current)) return;
    setBusy(true); setError('');
    try {
      const path = name === 'preview' ? 'preview' : `${current!.id}/${name}`;
      if (name === 'payment') {
        const result = await apiRequest<{ url: string }>(`/subscription/billing/upgrades/${path}`, { method: 'POST' });
        window.location.assign(result.url);
      } else {
        const result = await apiRequest<Upgrade>(`/subscription/billing/upgrades/${path}`, { method: 'POST',
          ...(name === 'preview' ? { body: JSON.stringify({ code: option!.code, revision: option!.revision }) } : {}) });
        setReview(name === 'preview' ? result : null);
        setData(await apiRequest<Data>('/subscription/billing/upgrades'));
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The upgrade could not be confirmed. Refresh or retry the saved request.'); }
    finally { setBusy(false); }
  }
  const u = data?.upgrade;
  return <Paper id="upgrade" tabIndex={-1} variant="outlined" sx={{ p: 3, scrollMarginTop: 100 }}><Stack spacing={2}>
    <Typography variant="h6">Upgrade your paid plan</Typography>
    <Typography>Keep your current billing interval and preview the prorated charge before confirming. Upgraded benefits start only after payment is verified. Your monthly reset date and used quota stay the same.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {u && <Alert severity={u.error ? 'warning' : u.state === 'applied' ? 'success' : 'info'}>
      <Typography>{u.plan_name} · {stateText[u.state] ?? u.state}</Typography>
      {u.error && <Typography variant="body2">{u.error}</Typography>}
      {u.state === 'pending_payment' && <Typography variant="body2">Your current paid plan remains active under its existing payment terms. Complete payment before {u.pending_until ? new Date(u.pending_until).toLocaleString() : 'the pending update expires'}.</Typography>}
      {u.confirm_allowed && <Button disabled={busy} onClick={() => setReview(u)}>Review saved preview</Button>}
      {u.payment_allowed && <Button disabled={busy} onClick={() => void action('payment')}>Complete payment securely</Button>}
      {u.retry_allowed && <Button disabled={busy} onClick={() => void action('retry')}>Check or retry saved upgrade</Button>}
    </Alert>}
    {data?.reason && <Typography variant="body2">{data.reason}</Typography>}
    {!!data?.items.length && <>
      <TextField fullWidth select label="Upgrade to" value={selection} disabled={busy} onChange={e => setSelection(e.target.value)}>
        <MenuItem value="">Choose a plan</MenuItem>
        {data.items.map(o => <MenuItem key={key(o)} value={key(o)}>{o.name} · {currency(Number(o.price), o.currency)} / {o.interval === 'annual' ? 'year' : 'month'}</MenuItem>)}
      </TextField>
      <Button variant="outlined" disabled={busy || !data.items.some(o => key(o) === selection)} onClick={() => void action('preview')}>Preview upgrade charge</Button>
    </>}
    <Dialog open={review !== null} onClose={() => { if (!busy) setReview(null); }} fullWidth maxWidth="sm">
      <DialogTitle>Review upgrade and payment</DialogTitle>
      <DialogContent>{review && <Stack spacing={1}>
        <Typography variant="h6">{review.plan_name}</Typography>
        <Typography>Unused-time credit: −{currency(review.credit / 100, review.currency)}</Typography>
        <Typography>Remaining-period charge: {currency(review.charge / 100, review.currency)}</Typography>
        <Typography fontWeight="bold">Due now: {currency(review.amount_due / 100, review.currency)}</Typography>
        <Typography>Then {currency(Number(review.recurring_price), review.currency)} / {review.interval === 'annual' ? 'year' : 'month'}, renewing {new Date(review.period_end).toLocaleString()}.</Typography>
        <Typography variant="body2">{review.limits.max_digests} active digests · {review.limits.runs_per_month} runs/month ({review.limits.manual_runs_per_month} manual) · {review.limits.papers_per_month} papers/month · {review.limits.max_papers_per_run} papers/run.</Typography>
        <Typography variant="body2">Schedules: {review.limits.schedule_frequencies.join(', ') || 'none'}. Email delivery: {review.limits.email_delivery ? 'included' : 'not included'}.</Typography>
        <Typography variant="body2">Calculated at {new Date(review.proration_at).toLocaleString()}. Preview expires {new Date(review.expires_at).toLocaleString()}.</Typography>
        <Alert severity="info">Confirming attempts this payment using your saved Stripe payment method. If authentication or another payment method is needed, your current plan stays active while you complete payment securely. Used allowance remains counted, and paused schedules stay paused.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>}</DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setReview(null)}>Back</Button><Button variant="contained" disabled={busy || !review?.confirm_allowed || Date.parse(review.expires_at) <= Date.now()} onClick={() => void action('confirm')}>Confirm and pay</Button></DialogActions>
    </Dialog>
  </Stack></Paper>;
}
