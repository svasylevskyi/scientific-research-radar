import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Container, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type Plan = { id: number; code: string; revision: number; configuration: { name: string; state: string } };
type Assignment = { id: number | null; version: number; mode: string; plan: Plan | null; change_note: string; created_at: string | null; created_by: string | null };
type Entry = { run_key: string; run_id: string | null; digest_id: string | null; topic: string; state: string; trigger: string;
  requested_papers: number; actual_papers: number; attempts: number; assignment_id: number | null;
  assessments: { at: string; reasons: string[]; would_block: boolean }[] };
type Overview = { user: { id: string; email: string }; tracking_since: string | null; assignment: Assignment;
  period_start: string; period_end: string; digest_count: number;
  usage: { completed_runs: number; reserved_runs: number; manual_runs: number; completed_papers: number; reserved_papers: number; released_runs: number };
  remaining: { runs: number | null; manual_runs: number | null; papers: number | null; digests: number | null };
  items: Entry[]; total: number };
type Users = { items: { id: string; email: string; full_name: string }[]; total: number };
const root = "/admin/subscription-observation";
const displayDate = (value: string | null) => value ? new Date(value).toLocaleString() : "Not yet recorded";
const remaining = (value: number | null) => value === null ? "No comparison limit" : value;

export function AdminSubscriptionObservationPage() {
  const [params, setParams] = useSearchParams();
  const userId = params.get("user_id") ?? "";
  const [query, setQuery] = useState("");
  const [userOffset, setUserOffset] = useState(0);
  const [users, setUsers] = useState<Users>({ items: [], total: 0 });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planTotal, setPlanTotal] = useState(0);
  const [planOffset, setPlanOffset] = useState(0);
  const [data, setData] = useState<Overview | null>(null);
  const [history, setHistory] = useState<{ items: Assignment[]; total: number }>({ items: [], total: 0 });
  const [historyOffset, setHistoryOffset] = useState(0);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState("");
  const assignmentSelection = useRef("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiRequest<Users>(`/admin/users?q=${encodeURIComponent(query)}&offset=${userOffset}&limit=25`)
        .then(result => { if (active) setUsers(result); }).catch(() => { if (active) setError("Could not load users."); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, userOffset]);
  useEffect(() => {
    let active = true;
    apiRequest<{ items: Plan[]; total: number }>(`/admin/subscription-plans?offset=${planOffset}&limit=100`)
      .then(result => { if (active) { setPlans(result.items); setPlanTotal(result.total); } })
      .catch(() => { if (active) setError("Could not load plans."); });
    return () => { active = false; };
  }, [planOffset, refresh]);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    if (!userId || !/^\d{4}-\d{2}$/.test(period)) return;
    apiRequest<Overview>(`${root}/${userId}?period=${period}-01&offset=${offset}&limit=25`)
      .then(result => { if (active) { setData(result);
        const key = `${userId}:${result.assignment.version}`;
        if (assignmentSelection.current !== key) {
          setSelectedPlan(result.assignment.plan ? String(result.assignment.plan.id) : "");
          assignmentSelection.current = key;
        } } })
      .catch(err => { if (active) setError(err instanceof ApiError ? err.message : "Could not load observation data."); });
    return () => { active = false; };
  }, [userId, period, offset, refresh]);
  useEffect(() => {
    let active = true; setHistory({ items: [], total: 0 });
    if (!userId) return;
    apiRequest<{ items: Assignment[]; total: number }>(`${root}/${userId}/assignments?offset=${historyOffset}&limit=10`)
      .then(result => { if (active) setHistory(result); })
      .catch(() => { if (active) setError("Could not load assignment history."); });
    return () => { active = false; };
  }, [userId, historyOffset, refresh]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!data) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await apiRequest(`${root}/${userId}/assignments`, { method: "POST", body: {
        expected_version: data.assignment.version, plan_revision_id: selectedPlan ? Number(selectedPlan) : null, change_note: note } });
      setNote(""); setHistoryOffset(0); setRefresh(value => value + 1);
      setSuccess("Observation assignment saved. User access and Stripe billing are unchanged.");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not save assignment."); }
    finally { setBusy(false); }
  }
  const options = plans.filter(plan => plan.configuration.state !== "archived");
  if (data?.assignment.plan && !options.some(plan => plan.id === data.assignment.plan?.id)) options.unshift(data.assignment.plan);
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: 4 }}>
    <Button component={Link} to="/admin/subscription-plans">Back to plans</Button>
    <Typography variant="h3" component="h1" gutterBottom>Subscription observation</Typography>
    <Alert severity="info" sx={{ mb: 3 }}>All users retain complimentary development access. Assignments compare usage against a fixed plan revision;
      they do not change billing or block any action. Allowances use UTC calendar months, including annual plans.</Alert>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField label="Find user by name or email" value={query} disabled={busy} onChange={e => { setQuery(e.target.value); setUserOffset(0); }} fullWidth />
        <TextField select label="User" value={userId} disabled={busy} fullWidth onChange={e => {
          setParams({ user_id: e.target.value }); setOffset(0); setHistoryOffset(0); setNote(""); setSuccess("");
        }}><MenuItem value="">Select a user</MenuItem>
          {userId && !users.items.some(user => user.id === userId) && <MenuItem value={userId}>{data?.user.email ?? userId}</MenuItem>}
          {users.items.map(user => <MenuItem key={user.id} value={user.id}>{user.email}</MenuItem>)}
        </TextField>
      </Stack>
      <Button disabled={busy || userOffset === 0} onClick={() => setUserOffset(value => Math.max(0, value - 25))}>Previous users</Button>
      <Button disabled={busy || userOffset + 25 >= users.total} onClick={() => setUserOffset(value => value + 25)}>More users</Button>
    </Paper>
    {data && <Stack spacing={3}>
      <Paper component="form" onSubmit={save} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Observation assignment · {data.user.email}</Typography>
        <Typography sx={{ mb: 2 }}>Current: {data.assignment.plan ? `${data.assignment.plan.configuration.name} · revision ${data.assignment.plan.revision}` : "Complimentary — no plan comparison"} · assignment version {data.assignment.version}</Typography>
        <Stack spacing={2}>
          <TextField select label="Compare against plan revision" value={selectedPlan} disabled={busy} onChange={e => setSelectedPlan(e.target.value)}>
            <MenuItem value="">Complimentary — no plan comparison</MenuItem>
            {options.map(plan => <MenuItem key={plan.id} value={String(plan.id)}>{plan.configuration.name} · revision {plan.revision} · {plan.configuration.state}</MenuItem>)}
          </TextField>
          {planTotal > 100 && <Stack direction="row"><Button disabled={planOffset === 0} onClick={() => setPlanOffset(value => Math.max(0, value - 100))}>Previous plans</Button>
            <Button disabled={planOffset + 100 >= planTotal} onClick={() => setPlanOffset(value => value + 100)}>More plans</Button></Stack>}
          <TextField label="Reason for change" required inputProps={{ maxLength: 500 }} value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
          <Typography variant="body2" color="text.secondary">Changing the assignment does not reset monthly usage. Existing run reservations and retries retain their original assignment.</Typography>
          <Button type="submit" variant="contained" disabled={busy || !note.trim()} sx={{ alignSelf: "flex-start" }}>Save observation assignment</Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h5" component="h2" sx={{ flexGrow: 1 }}>Monthly usage</Typography>
          <TextField type="month" label="UTC allowance month" value={period} slotProps={{ inputLabel: { shrink: true } }} onChange={e => { if (e.target.value) { setPeriod(e.target.value); setOffset(0); } }} />
          <Button disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Tracking since {displayDate(data.tracking_since)}. Older runs are not backfilled. Remaining allowances compare the selected month's recorded usage with the current assignment, even when viewing a past month.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <Typography>Runs: {data.usage.completed_runs} completed + {data.usage.reserved_runs} reserved. Remaining: {remaining(data.remaining.runs)}</Typography>
          <Typography>Manual runs: {data.usage.manual_runs} completed/reserved. Remaining: {remaining(data.remaining.manual_runs)}</Typography>
          <Typography>Papers: {data.usage.completed_papers} completed + {data.usage.reserved_papers} reserved. Remaining: {remaining(data.remaining.papers)}</Typography>
          <Typography>Current digests: {data.digest_count}. Additional allowed: {remaining(data.remaining.digests)}</Typography>
        </Box>
        <Typography sx={{ mt: 2 }}>Released failed runs: {data.usage.released_runs}. Retries reuse the same run allowance and original month.</Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Recorded runs and simulated limits</Typography>
        {!data.items.length && <Typography>No observed runs in this month.</Typography>}
        {data.items.map(row => <Box key={row.run_key} sx={{ py: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography fontWeight={600}>{row.topic}</Typography>
          <Typography>{row.trigger} · {row.state} · {row.attempts} attempt(s) · {row.requested_papers} papers requested / {row.actual_papers} summarized</Typography>
          <Typography variant="body2" color="text.secondary">Original assignment: {row.assignment_id ?? "Complimentary default"}</Typography>
          {row.assessments.map((assessment, index) => <Alert key={index} severity={assessment.would_block ? "warning" : "success"} sx={{ mt: 1 }}>
            Attempt {index + 1}: {assessment.would_block ? `Would block: ${assessment.reasons.join("; ")}. Run was allowed in observation mode.` : "No simulated limit exceeded."}
          </Alert>)}
          {row.digest_id && row.run_id ? <Button component={Link} to={`/admin/digests/${row.digest_id}/runs?run_id=${row.run_id}`}>Review run</Button> : <Typography variant="body2">Run deleted; usage record retained.</Typography>}
        </Box>)}
        <Button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous runs</Button>
        <Button disabled={offset + 25 >= data.total} onClick={() => setOffset(value => value + 25)}>More runs</Button>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>Assignment history</Typography>
        {!history.items.length && <Typography>Complimentary development access; no explicit assignment yet.</Typography>}
        {history.items.map(item => <Box key={item.id} sx={{ py: 1 }}>
          <Typography>Version {item.version} · {item.plan ? `${item.plan.configuration.name} revision ${item.plan.revision}` : "Complimentary"} · {displayDate(item.created_at)}</Typography>
          <Typography variant="body2">{item.change_note}</Typography>
        </Box>)}
        <Button disabled={historyOffset === 0} onClick={() => setHistoryOffset(value => Math.max(0, value - 10))}>Previous assignments</Button>
        <Button disabled={historyOffset + 10 >= history.total} onClick={() => setHistoryOffset(value => value + 10)}>More assignments</Button>
      </Paper>
    </Stack>}
  </Container></Box>;
}
