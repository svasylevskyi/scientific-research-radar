import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Container, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type Job = { id: string; checkout_id: string; user_id: string; email: string; kind: string; event_type: string | null;
  subscription_status: string | null; price_matches: boolean; state: string; attempts: number; failures: number; manual_retries: number; retried_by: string | null; retried_at: string | null;
  next_attempt_at: string | null; lease_expires_at: string | null; last_error: string | null;
  last_attempt_at: string | null; last_success_at: string | null; provider_observed_at: string | null };
type Status = { counts: Record<string, number>; worker_healthy: boolean; worker_last_seen_at: string | null;
  items: Job[]; total: number };
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";
const states = ["pending", "processing", "retry", "failed", "processed"];

export function AdminBillingSyncPage() {
  const [params, setParams] = useSearchParams();
  const owner = params.get("user_id");
  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setData(null);
    async function poll() {
      try {
        const query = new URLSearchParams({ offset: String(offset), limit: "25" });
        if (state) query.set("state", state);
        if (owner) query.set("user_id", owner);
        const result = await apiRequest<Status>(`/admin/billing-sync?${query}`);
        if (active) { setData(result); setPollError(""); }
      } catch (err) { if (active) setPollError(err instanceof ApiError ? err.message : "Could not load synchronization status."); }
      if (active) timer = setTimeout(poll, 10000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [owner, state, offset, refresh]);
  async function retry(job: Job) {
    setBusy(job.id); setError("");
    try {
      await apiRequest(`/admin/billing-sync/${encodeURIComponent(job.id)}/retry`, { method: "POST" });
      setRefresh(value => value + 1);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not queue synchronization."); }
    finally { setBusy(""); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: 4 }}>
    <Button component={Link} to="/admin/subscription-plans">Back to plans</Button>
    <Typography component="h1" variant="h3" gutterBottom>Billing synchronization</Typography>
    <Alert severity="info" sx={{ mb: 3 }}>Sandbox only. Webhooks are saved before acknowledgment and processed in the background.
      Known subscriptions are checked periodically against Stripe. Synchronization does not change user access or usage allowances.</Alert>
    {(error || pollError) && <Alert severity="error" sx={{ mb: 2 }}>{error || pollError}</Alert>}
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
      <TextField select label="Job status" value={state} onChange={e => { setState(e.target.value); setOffset(0); }} sx={{ minWidth: 220 }}>
        <MenuItem value="">All statuses</MenuItem>{states.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <Button onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
      {owner && <Button onClick={() => { setParams({}); setOffset(0); }}>Show all accessible users</Button>}
    </Stack>
    {!data && !pollError && <Typography role="status">Loading synchronization status…</Typography>}
    {data && <Stack spacing={2}>
      <Alert severity={data.worker_healthy ? "success" : "warning"}>
        Worker {data.worker_healthy ? "is checking the queue" : "has no recent heartbeat; check the API service"}.
        Last heartbeat: {date(data.worker_last_seen_at)}. A healthy worker can still have failed jobs below.
      </Alert>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
        {states.map(value => <Chip key={value} label={`${value}: ${data.counts[value] ?? 0}`} color={value === "failed" && data.counts[value] ? "error" : "default"} />)}
      </Stack>
      <Typography variant="body2" color="text.secondary">Processed reconciliation jobs show their next periodic check. Processed webhooks are retained for duplicate detection.
        Failed jobs have exhausted automatic retries and need review. No provider calls are made by refreshing this page.</Typography>
      {!data.items.length && <Typography>No matching synchronization jobs. New checkout attempts are discovered automatically.</Typography>}
      {data.items.map(job => {
        const expired = job.state === "processing" && !!job.lease_expires_at && new Date(job.lease_expires_at).getTime() <= Date.now();
        const retryable = ["failed", "retry"].includes(job.state) || expired || (job.kind === "reconcile" && job.state === "processed");
        return <Paper key={job.id} variant="outlined" sx={{ p: 3, overflowWrap: "anywhere" }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
            <Typography component="h2" variant="h6">{job.kind === "webhook" ? job.event_type : "Periodic reconciliation"}</Typography>
            <Chip label={job.state} color={job.state === "failed" ? "error" : "default"} />
          </Stack>
          <Typography>{job.email} · Checkout attempt {job.checkout_id}</Typography>
          <Typography variant="body2" color="text.secondary">Job {job.id}</Typography>
          {job.last_error && <Alert severity={job.state === "failed" ? "error" : "warning"} sx={{ my: 1 }}>{job.last_error}</Alert>}
          <Typography>Attempts: {job.attempts} · Consecutive failures: {job.failures} · Manual requests: {job.manual_retries}</Typography>
          <Typography>Last attempt: {date(job.last_attempt_at)} · Last successful job: {date(job.last_success_at)}</Typography>
          <Typography>Subscription status: {job.subscription_status ?? "Not established"}</Typography>
          {!job.price_matches && <Alert severity="warning" sx={{ my: 1 }}>The Stripe price no longer matches the saved plan revision.</Alert>}
          <Typography>Last verified Stripe state: {date(job.provider_observed_at)}</Typography>
          <Typography>Next check/retry: {job.next_attempt_at ? date(job.next_attempt_at) : "None scheduled"}</Typography>
          {job.retried_at && <Typography variant="body2">Last manual request: {date(job.retried_at)} · Admin {job.retried_by ?? "deleted"}</Typography>}
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 1 }}>
            <Button variant="outlined" disabled={!!busy || !retryable} onClick={() => void retry(job)}>
              {job.kind === "reconcile" && job.state === "processed" ? "Reconcile now" : "Retry synchronization"}
            </Button>
            <Button onClick={() => { setParams({ user_id: job.user_id }); setOffset(0); }}>Filter this user</Button>
            <Button component={Link} to={`/admin/users/${job.user_id}`}>User details</Button>
          </Stack>
        </Paper>;
      })}
      <Stack direction="row" spacing={2}>
        <Button disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous</Button>
        <Typography sx={{ alignSelf: "center" }}>{data.total} matching jobs</Typography>
        <Button disabled={offset + 25 >= data.total} onClick={() => setOffset(value => value + 25)}>Next</Button>
      </Stack>
    </Stack>}
  </Container></Box>;
}
