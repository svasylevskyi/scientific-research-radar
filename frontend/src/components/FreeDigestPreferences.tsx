import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { apiRequest, ApiError } from '../api/client';

type Choices = { available: boolean; effective: boolean; limit: number; selected_ids: string[];
  items: { id: string; topic: string; schedule_paused: boolean }[] };
export function FreeDigestPreferences({ billingType }: { billingType?: string | null }) {
  const [data, setData] = useState<Choices | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest<Choices>('/subscription/free-digests').then(result => {
      if (active) { setData(result); setSelected(result.selected_ids); setError(''); }
    }).catch(e => { if (active) setError(e instanceof ApiError ? e.message : 'Could not load Free preferences.'); });
    return () => { active = false; };
  }, [billingType, reload]);
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest<Choices>('/subscription/free-digests', { method: 'PUT', body: { digest_ids: selected } });
      setData(result); setSelected(result.selected_ids); setMessage('Free digest preferences saved. Usage has not been reset.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  if (data && !data.available) return null;
  return <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={1}>
    <Typography variant="h6">Digests to keep active on Free</Typography>
    {error && <Alert severity="error">{error}<Button onClick={() => setReload(v => v + 1)}>Reload</Button></Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    {data && <>
      <Typography>{data.effective ? 'Free is active.' : 'These preferences apply when paid access ends.'} Choose up to {data.limit} digest(s). Others remain saved and readable, with new research inactive. If you have not chosen, the most recently used digests are selected.</Typography>
      {data.items.map(item => <Stack key={item.id} direction="row" alignItems="center" useFlexGap flexWrap="wrap">
        <FormControlLabel label={item.topic} control={<Checkbox checked={selected.includes(item.id)} disabled={busy}
          onChange={e => setSelected(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />} />
        <Button component={Link} to={`/digests/${item.id}`}>Open digest</Button>
        {item.schedule_paused && <Typography variant="body2">Schedule paused. Review and save it after upgrading to resume future runs.</Typography>}
      </Stack>)}
      {!data.items.length && <Typography>No saved digests yet.</Typography>}
      <Typography variant="body2">Changing this selection does not reset allowances. Scheduled runs and emails that your plan no longer includes are paused; already accepted work can finish.</Typography>
      <Button sx={{ alignSelf: 'flex-start' }} disabled={busy || selected.length !== Math.min(data.limit, data.items.length)} onClick={() => void save()}>Save Free preferences</Button>
    </>}
  </Stack></Paper>;
}
