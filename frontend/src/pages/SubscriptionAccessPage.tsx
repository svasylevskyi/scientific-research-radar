import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type Access = { email?: string; mode: "complimentary" | "sandbox"; version: number; allowed: boolean; reason: string;
  payment_status?: string; paid_through?: string | null; payment_issue?: string | null;
  status: string; observed_at: string | null; period_start: string | null; period_end: string | null;
  access_until: string | null; grace_until: string | null; cancel_at_period_end: boolean;
  plan: { name: string; configuration: { max_papers_per_run: number; schedule_frequencies: string[]; email_delivery: boolean } } | null;
  remaining: { runs: number | null; manual_runs: number | null; papers: number | null; digests: number | null };
  usage: { completed_runs: number; reserved_runs: number; completed_papers: number; reserved_papers: number };
  history?: { version: number; mode: string; created_at: string; change_note: string }[] };
const date = (s: string | null) => s ? new Date(s).toLocaleString() : "Not available";

export function SubscriptionAccessPage({ admin = false }: { admin?: boolean }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const userId = params.get("user_id");
  const [data, setData] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState("complimentary");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmedVersion, setConfirmedVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setData(null); setError("");
    async function poll() {
      if (admin && !userId) return;
      try {
        const result = await apiRequest<Access>(admin ? `/admin/subscription-access/${userId}?offset=${offset}` : "/subscription");
        if (active) { setData(result); setError(""); }
      } catch (err) { if (active) setError(err instanceof ApiError ? err.message : "Could not load subscription details."); }
      if (active) timer = setTimeout(poll, 10000);
    }
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [admin, userId, refresh, offset]);
  const loaded = data !== null;
  useEffect(() => {
    if (loaded && location.hash === "#upgrade") {
      document.getElementById("upgrade")?.scrollIntoView({ block: "start" });
      document.getElementById("upgrade")?.focus({ preventScroll: true });
    }
  }, [loaded, location.hash]);
  async function save() {
    if (!data || !userId) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/subscription-access/${userId}/policy`, { method: "POST", body: {
        mode, expected_version: confirmedVersion, change_note: note,
      } });
      setConfirm(false); setNote(""); setOffset(0); setRefresh(x => x + 1);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not change access policy."); setConfirm(false); }
    finally { setBusy(false); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="md" sx={{ py: 4 }}>
    <Typography component="h1" variant="h3" gutterBottom>{admin ? "Subscription access" : "Subscription and usage"}</Typography>
    {admin && <Alert severity="info" sx={{ mb: 2 }}>Sandbox rollout. Opting an account in applies real research limits using its verified test subscription.
      Observation assignments remain separate. Switching modes preserves previously counted usage.</Alert>}
    {admin && !userId && <Button component={Link} to="/admin/users">Choose a user in user administration</Button>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!data && !error && (!admin || userId) && <Typography role="status">Loading subscription…</Typography>}
    {data && <Stack spacing={2}>
      {data.email && <Typography>{data.email}</Typography>}
      <Alert severity={data.allowed ? (data.grace_until ? "warning" : "info") : "warning"}>{data.reason}</Alert>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6">{data.plan?.name ?? (data.mode === "complimentary" ? "Complimentary development access" : "Subscription not verified")}</Typography>
        <Typography>Access mode: {data.mode === "sandbox" ? "Sandbox subscription limits" : "Complimentary"}</Typography>
        {data.mode === "sandbox" && <>
          <Typography>Status: {data.status}</Typography>
          <Typography>Invoice status: {data.payment_status ?? "Not verified"} · Settled coverage through: {date(data.paid_through ?? null)}</Typography>
          <Typography>Last verified: {date(data.observed_at)}</Typography>
          <Typography>Allowance window: {date(data.period_start)} – {date(data.period_end)}</Typography>
          <Typography>Verified access until: {date(data.access_until)}</Typography>
          {data.cancel_at_period_end && <Alert severity="info" sx={{ mt: 1 }}>Cancellation is scheduled. Access continues through the verified period; saved results remain readable afterward.</Alert>}
        </>}
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6">Available allowances</Typography>
        {Object.entries(data.remaining).map(([key, value]) => <Typography key={key}>{key.replaceAll("_", " ")}: {value ?? (data.mode === "complimentary" ? "No subscription limit" : "Not available")}</Typography>)}
        <Typography sx={{ mt: 1 }}>Completed runs: {data.usage.completed_runs} · Reserved runs: {data.usage.reserved_runs}</Typography>
        <Typography>Completed papers: {data.usage.completed_papers} · Reserved papers: {data.usage.reserved_papers}</Typography>
        {data.plan && <Typography>Up to {data.plan.configuration.max_papers_per_run} papers per run. Schedules: {data.plan.configuration.schedule_frequencies.join(", ") || "not included"}.
          Email delivery: {data.plan.configuration.email_delivery ? "included" : "not included"}.</Typography>}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Allowances reset monthly on the subscription anniversary, including annual plans.
          Queued work reserves capacity. Successful runs count actual summarized papers; failed runs release their reservation.
          Retrying checks the current window again. Usage shown here starts when sandbox limits are enabled; earlier observation usage remains separate.</Typography>
      </Paper>
      {!admin && <Paper id="upgrade" tabIndex={-1} variant="outlined" sx={{ p: 3, scrollMarginTop: 100 }}>
        <Typography variant="h6">Need higher allowances?</Typography>
        <Typography>Upgrade to a plan with more digest slots, runs or papers, or additional scheduling options.
          Self-service upgrades are not available in this development version. Contact the Radar administrator to discuss access; viewing plans does not change your subscription.</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>Digest slots are freed by deleting a digest and do not reset each month. Research allowances reset on the date shown above.
          Payment or synchronization issues must be resolved before research can resume.</Typography>
        <Button component={Link} to="/plans">Preview plans</Button>
      </Paper>}
      {admin && <Paper variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
        <Typography variant="h6">Change access mode</Typography>
        <TextField select label="New access mode" value={mode} onChange={e => setMode(e.target.value)}>
          <MenuItem value="complimentary">Complimentary development access</MenuItem>
          <MenuItem value="sandbox">Enforce sandbox subscription limits</MenuItem>
        </TextField>
        <TextField label="Reason for change" value={note} onChange={e => setNote(e.target.value)} inputProps={{ maxLength: 500 }} />
        <Button variant="contained" disabled={busy || !note.trim() || mode === data.mode} onClick={() => { setConfirmedVersion(data.version); setConfirm(true); }}>Review change</Button>
        <Button component={Link} to={`/admin/billing-sync?user_id=${userId}`}>Billing synchronization</Button>
        <Typography variant="h6">Access policy history</Typography>
        {!data.history?.length && <Typography>No policy changes recorded.</Typography>}
        {data.history?.map(row => <Typography key={row.version}>Revision {row.version} · {row.mode} · {date(row.created_at)} — {row.change_note}</Typography>)}
        <Stack direction="row"><Button disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 25))}>Previous</Button>
          <Button disabled={(data.history?.length ?? 0) < 25} onClick={() => setOffset(x => x + 25)}>Next</Button></Stack>
      </Stack></Paper>}
    </Stack>}
    <Dialog open={confirm} onClose={() => { if (!busy) setConfirm(false); }}>
      <DialogTitle>Change research access?</DialogTitle><DialogContent>
        {mode === "sandbox" ? "This account will need a verified sandbox subscription and remaining allowance to create digests or start research. Saved results remain accessible." : "This restores complimentary development research access. Existing usage records will be retained."}
      </DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>Confirm change</Button></DialogActions>
    </Dialog>
  </Container></Box>;
}
