import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { apiRequest, ApiError } from '../api/client';
import { startPagePolling } from '../pagePolling';

type Digest = { id: string; topic: string };
type Option = { code: string; revision: number; name: string; interval: string; price: string; currency: string; max_digests: number; max_papers_per_run: number; runs_per_month: number; manual_runs_per_month: number; papers_per_month: number; schedule_frequencies: string[]; email_delivery: boolean };
type Change = { id: string; state: string; plan_name: string; interval: string; price: string; currency: string; effective_at: string; error: string | null; undo_allowed: boolean; retry_allowed: boolean };
type Data = { items: Option[]; change: Change | null; digests: Digest[]; effective_at?: string; reason: string };
type Active = { available: boolean; items: Digest[]; selected_ids: string[]; limit: number };
type Notice = { id: string; subject: string; text: string; email_status: string; created_at: string };
const money = (o: { price: string; currency: string }) => new Intl.NumberFormat(undefined, { style: 'currency', currency: o.currency }).format(Number(o.price));
const label = (o: Option) => `${o.name} · ${money(o)} / ${o.interval === 'annual' ? 'year' : 'month'}`;
const key = (o: Option) => `${o.code}:${o.revision}:${o.interval}`;

export function SubscriptionChanges() {
  const [data, setData] = useState<Data | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selection, setSelection] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [activeDirty, setActiveDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'schedule' | 'undo' | null>(null);
  const selected = data?.items.find(o => key(o) === selection);
  async function load() {
    const [next, preferences, messages] = await Promise.all([
      apiRequest<Data>('/subscription/billing/changes'),
      apiRequest<Active>('/subscription/billing/active-digests'),
      apiRequest<{ items: Notice[] }>('/subscription/billing/notifications'),
    ]);
    setData(next); setActive(preferences); setNotices(messages.items);
  }
  useEffect(() => startPagePolling(async () => {
    try { await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load subscription changes.'); }
  }, 10000), []);
  useEffect(() => { if (active && !activeDirty) setActiveIds(active.selected_ids); }, [active, activeDirty]);
  function choose(value: string) {
    setSelection(value);
    const option = data?.items.find(o => key(o) === value);
    setIds(data?.digests.slice(0, option?.max_digests ?? 0).map(d => d.id) ?? []);
  }
  function toggle(current: string[], id: string) { return current.includes(id) ? current.filter(v => v !== id) : [...current, id]; }
  async function action(name: 'schedule' | 'undo' | 'retry' | 'digests') {
    if (busy || !data) return;
    setBusy(true); setError('');
    try {
      if (name === 'schedule' && selected) {
        await apiRequest('/subscription/billing/changes', { method: 'POST', body: JSON.stringify({ code: selected.code, revision: selected.revision, interval: selected.interval, expected_period_end: data.effective_at, digest_ids: ids }) });
      } else if (name === 'digests') {
        await apiRequest('/subscription/billing/active-digests', { method: 'PUT', body: JSON.stringify({ digest_ids: activeIds }) });
        setActiveDirty(false);
      } else if (data.change) {
        await apiRequest(`/subscription/billing/changes/${data.change.id}/${name}`, { method: 'POST' });
      }
      setConfirm(null); setSelection(''); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The change could not be confirmed. Refresh or retry the saved request.'); }
    finally { setBusy(false); }
  }
  return <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
    <Typography variant="h6">Changes at renewal</Typography>
    <Typography>Downgrades and monthly/yearly switches start at your next renewal. There is no immediate charge or proration. Your monthly allowance reset date and used allowance stay the same.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {data?.change && <Alert severity={data.change.error ? 'warning' : 'info'}>
      {data.change.plan_name} · {money(data.change)} / {data.change.interval === 'annual' ? 'year' : 'month'} · {new Date(data.change.effective_at).toLocaleString()}
      <Typography variant="body2">Status: {data.change.state.replaceAll('_', ' ')}</Typography>
      {data.change.error && <Typography variant="body2">{data.change.error}</Typography>}
      {data.change.undo_allowed && <Button disabled={busy} onClick={() => setConfirm('undo')}>Undo scheduled change</Button>}
      {data.change.retry_allowed && <Button disabled={busy} onClick={() => void action('retry')}>Retry saved request</Button>}
      {data.change.state === 'awaiting_payment' && <Typography>Payment verification is pending. Use Manage billing to update your payment method if needed.</Typography>}
    </Alert>}
    {data?.reason && <Typography variant="body2">{data.reason}</Typography>}
    {!!data?.items.length && <>
      <TextField select fullWidth label="Plan and billing interval at next renewal" value={selection} disabled={busy} onChange={e => choose(e.target.value)}>
        <MenuItem value="">Choose a change</MenuItem>
        {data.items.map(o => <MenuItem key={key(o)} value={key(o)}>{label(o)}</MenuItem>)}
      </TextField>
      {selected && <>
        <Typography>{selected.max_digests} active digests · {selected.runs_per_month} runs/month · {selected.manual_runs_per_month} manual runs/month · {selected.papers_per_month} papers/month · {selected.max_papers_per_run} papers/run.</Typography>
        <Typography variant="body2">Schedules: {selected.schedule_frequencies.join(', ') || 'none'}. Email delivery: {selected.email_delivery ? 'included' : 'not included'}. Excess digests and all saved research are retained. Incompatible schedules pause and require explicit resumption.</Typography>
        {data.digests.length > selected.max_digests && <Stack>
          <Typography>Choose {selected.max_digests} digests to keep active:</Typography>
          {data.digests.map(d => <FormControlLabel key={d.id} control={<Checkbox checked={ids.includes(d.id)} disabled={busy || (!ids.includes(d.id) && ids.length >= selected.max_digests)} onChange={() => setIds(toggle(ids, d.id))} />} label={d.topic} />)}
        </Stack>}
        <Button variant="contained" disabled={busy || ids.length !== Math.min(selected.max_digests, data.digests.length)} onClick={() => setConfirm('schedule')}>Review change</Button>
      </>}
    </>}
    {active?.available && active.items.length > active.limit && <Stack spacing={1}>
      <Typography variant="subtitle1">Active digests on your paid plan</Typography>
      <Typography variant="body2">Choose {active.limit}. Other digests and their saved research remain available to read and edit.</Typography>
      {active.items.map(d => <FormControlLabel key={d.id} control={<Checkbox checked={activeIds.includes(d.id)} disabled={busy || (!activeIds.includes(d.id) && activeIds.length >= active.limit)} onChange={() => { setActiveIds(toggle(activeIds, d.id)); setActiveDirty(true); }} />} label={d.topic} />)}
      <Button disabled={busy || !activeDirty || activeIds.length !== Math.min(active.limit, active.items.length)} onClick={() => void action('digests')}>Save active digests</Button>
    </Stack>}
    {!!notices.length && <Stack spacing={1}>
      <Typography variant="subtitle1">Subscription notifications</Typography>
      {notices.slice(0, 5).map(n => <Alert key={n.id} severity={n.email_status === 'failed' ? 'warning' : 'info'}>
        <Typography>{n.subject} · {new Date(n.created_at).toLocaleString()}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{n.text}</Typography>
        {n.email_status === 'failed' && <Typography variant="body2">Email delivery failed. This notification remains available here.</Typography>}
      </Alert>)}
    </Stack>}
    <Dialog open={confirm !== null} onClose={() => { if (!busy) setConfirm(null); }}>
      <DialogTitle>{confirm === 'undo' ? 'Undo the scheduled change?' : 'Confirm change at renewal'}</DialogTitle>
      <DialogContent>
        {confirm === 'undo' ? 'Your current plan and billing interval will continue. Undo is unavailable during the final 30 seconds before renewal while the change starts.' : selected && <>
          <Typography>{label(selected)} starting {data?.effective_at ? new Date(data.effective_at).toLocaleString() : 'at renewal'}.</Typography>
          <Typography>Your subscription will renew at this recurring price. No charge is made now. Used quota stays counted; lower limits can leave zero allowance until your next monthly reset. Saved research is retained.</Typography>
        </>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirm(null)}>Back</Button><Button disabled={busy || (confirm === 'schedule' && !selected)} onClick={() => void action(confirm === 'undo' ? 'undo' : 'schedule')}>Confirm</Button></DialogActions>
    </Dialog>
  </Stack></Paper>;
}
