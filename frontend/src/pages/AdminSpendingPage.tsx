import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Container, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { ApiError, apiRequest } from "../api/client";

type Report = { from_date: string; to_date: string; project_id: string; fetched_at: string;
  reported_usd: string; known_estimated_usd: string; unknown_requests: number; legacy_runs: number;
  daily: { date: string; reported_usd: string | null; known_estimated_usd: string; requests: number; unknown_requests: number }[];
  charges: { line_item: string; reported_usd: string }[] };
const money = (value: string | null) => value === null ? "Not reported" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(value));
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export function AdminSpendingPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(null); setData(null);
    try {
      setData(await apiRequest<Report>(`/admin/spending?${new URLSearchParams({ from_date: from, to_date: to })}`));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not load spending. Please try again."); }
    finally { setLoading(false); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
    <Typography component="h1" variant="h3" gutterBottom>OpenAI spending</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Compare OpenAI’s reported project spending with this environment’s recorded research estimates.</Typography>
    <Stack spacing={3}>
      <Paper variant="outlined" component="form" onSubmit={load} sx={{ p: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField required label="From (UTC)" type="date" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || today() } }} disabled={loading} />
          <TextField required label="To (UTC, inclusive)" type="date" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from, max: today() } }} disabled={loading} />
          <Button variant="contained" type="submit" disabled={loading}>{loading ? "Loading…" : "Load spending"}</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Up to 93 days. Provider results are cached for five minutes; loading does not trigger research runs.</Typography>
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Typography role="status">Retrieving spending details…</Typography>}
      {data && <>
        <Alert severity="info">Period: {data.from_date}–{data.to_date} (UTC). Project: {data.project_id}. Provider data fetched: {new Date(data.fetched_at).toLocaleString()}.</Alert>
        <Alert severity="warning">OpenAI reporting can lag. Provider totals may include other applications or environments in this project. Local estimates use request creation dates and exclude unknown costs; older discarded usage cannot be recovered. These figures are not an exact reconciliation or an invoice.</Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Paper variant="outlined" sx={{ p: 3, flex: 1 }}><Typography color="text.secondary">OpenAI reported total</Typography><Typography variant="h4">{money(data.reported_usd)}</Typography></Paper>
          <Paper variant="outlined" sx={{ p: 3, flex: 1 }}><Typography color="text.secondary">Local known estimate subtotal</Typography><Typography variant="h4">{money(data.known_estimated_usd)}</Typography><Typography variant="body2">{data.unknown_requests} unpriced attempts · {data.legacy_runs} runs started in this period with ledger gaps</Typography></Paper>
        </Stack>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h6">Daily comparison</Typography><TableContainer><Table size="small" aria-label="Daily spending"><TableHead><TableRow>{["Day (UTC)", "OpenAI reported", "Local known estimate", "Local attempts", "Unpriced attempts"].map((h) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{data.daily.map((row) => <TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell>{money(row.reported_usd)}</TableCell><TableCell>{money(row.known_estimated_usd)}</TableCell><TableCell>{row.requests}</TableCell><TableCell>{row.unknown_requests}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h6">Reported charges</Typography>{!data.charges.length ? <Typography>No charges returned for this period.</Typography> : <TableContainer><Table size="small" aria-label="Reported charges"><TableHead><TableRow><TableCell>Charge</TableCell><TableCell>Reported USD</TableCell></TableRow></TableHead><TableBody>{data.charges.map((row) => <TableRow key={row.line_item}><TableCell>{row.line_item}</TableCell><TableCell>{money(row.reported_usd)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</Paper>
      </>}
    </Stack>
  </Container></Box>;
}
