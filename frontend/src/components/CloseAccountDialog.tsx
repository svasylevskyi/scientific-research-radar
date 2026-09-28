import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { useRef, useState, type FormEvent } from "react";
import { accountClosureApi, type AccountClosure } from "../api/accountClosure";
import { ApiError } from "../api/client";

export function CloseAccountDialog({ open, onClose, onAccepted, userId, name }: {
  open: boolean; onClose: () => void; onAccepted: (value: AccountClosure) => void; userId?: string; name?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  function dismiss() { if (!busy) { setPassword(""); setConfirmed(false); setError(null); onClose(); } }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || !password || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      const result = await accountClosureApi.request(password, userId);
      setPassword(""); setConfirmed(false); onAccepted(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not confirm closure. Check your connection and try again.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <Dialog open={open} onClose={dismiss} fullWidth maxWidth="sm" aria-labelledby="close-account-title">
    <form onSubmit={submit}>
      <DialogTitle id="close-account-title">Close {userId ? `${name ?? "this user"}'s` : "your"} account?</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Typography>Access ends immediately. Saved digests, research history, profile details, and associated contact messages will be removed. Existing research requests may finish before removal.</Typography>
        <Typography>We will cancel Radar subscriptions and expire unfinished checkouts. Any unresolved payments require review. Payment records may remain with Stripe for billing and legal purposes.</Typography>
        <Typography>Closure does not automatically refund unused paid time. Contact the administration team to request a refund. To keep access until the paid period ends, cancel renewal in Subscription and usage instead.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label={userId ? "Your administrator password" : "Current password"} type="password" autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} fullWidth inputProps={{ maxLength: 128 }} />
        <FormControlLabel control={<Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />}
          label="I understand that closing this account is permanent and cannot be undone." />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={dismiss} disabled={busy}>Keep account</Button>
        <Button type="submit" color="error" variant="contained" disabled={busy || !confirmed || !password}>{busy ? "Requesting closure…" : "Close account permanently"}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
