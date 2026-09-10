import { Link } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, Box, Button, Checkbox, Chip, Container, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type StripeMapping = { product_id: string; monthly_price_id: string; annual_price_id: string | null };
type StripeCheck = { matches: boolean; issues: string[]; checked_at: string;
  prices: { interval: string; price_id: string; tax_behavior: string | null; currency: string; unit_amount: number }[] };
type Configuration = {
  name: string; description: string; state: string; currency: string;
  monthly_price: string; annual_price: string | null; tax_display: string;
  max_digests: number; max_papers_per_run: number; papers_per_month: number;
  runs_per_month: number; manual_runs_per_month: number; schedule_frequencies: string[];
  stripe_sandbox?: StripeMapping | null;
  email_delivery: boolean; trial_days: number; display_order: number;
};
type Plan = { id: number; code: string; revision: number; configuration: Configuration;
  change_note: string; created_by: string | null; created_at: string };
type PlanList = { items: Plan[]; total: number };
const blank = (): Configuration => ({ name: "", description: "", state: "draft", currency: "EUR",
  monthly_price: "0.00", annual_price: null, tax_display: "undecided", max_digests: 1,
  max_papers_per_run: 10, papers_per_month: 10, runs_per_month: 1, manual_runs_per_month: 1,
  schedule_frequencies: [], email_delivery: true, trial_days: 0, display_order: 0 });
const limits = [
  ["max_digests", "Maximum digests", 1, 10000], ["max_papers_per_run", "Maximum papers per run", 1, 30],
  ["papers_per_month", "Papers per monthly allowance period", 1, 1000000],
  ["runs_per_month", "Total runs per monthly allowance period", 0, 100000],
  ["manual_runs_per_month", "Manual runs within that total", 0, 100000],
  ["trial_days", "Trial days (0 = none)", 0, 365], ["display_order", "Display order", 0, 10000],
] as const;
const frequencies = ["daily", "weekly", "monthly", "quarterly"];
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const grid = { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 };

export function AdminSubscriptionPlansPage() {
  const [form, setForm] = useState<Configuration>(blank);
  const [code, setCode] = useState("");
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState("");
  const [list, setList] = useState<PlanList>({ items: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [historyCode, setHistoryCode] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [history, setHistory] = useState<PlanList | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [check, setCheck] = useState<{ id: number; result?: StripeCheck; error?: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true; setLoading(true);
    apiRequest<PlanList>(`/admin/subscription-plans?offset=${offset}&limit=25`)
      .then((data) => { if (active) setList(data); })
      .catch(() => { if (active) setError("Could not load plans. Reload the catalogue to retry."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset, refresh]);
  useEffect(() => {
    if (!historyCode) return;
    let active = true; setHistory(null); setHistoryError(false);
    apiRequest<PlanList>(`/admin/subscription-plans/${historyCode}/revisions?offset=${historyOffset}&limit=25`)
      .then((data) => { if (active) setHistory(data); })
      .catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [historyCode, historyOffset, refresh]);
  function update<K extends keyof Configuration>(key: K, value: Configuration[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  function reset() { setForm(blank()); setCode(""); setRevision(0); setNote(""); }
  function edit(plan: Plan) {
    setForm(plan.configuration); setCode(plan.code); setRevision(plan.revision); setNote(""); setError(""); setSuccess("");
    document.getElementById("plan-editor")?.scrollIntoView({ behavior: "smooth" });
  }
  async function verify(plan: Plan) {
    setChecking(plan.id); setCheck(null);
    try {
      const result = await apiRequest<StripeCheck>(`/admin/subscription-plans/${plan.code}/revisions/${plan.revision}/check-stripe`, { method: "POST" });
      setCheck({ id: plan.id, result });
    } catch (caught) { setCheck({ id: plan.id, error: caught instanceof ApiError ? caught.message : "Could not check Stripe." }); }
    finally { setChecking(null); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const saved = await apiRequest<Plan>("/admin/subscription-plans", { method: "POST",
        body: { code, expected_revision: revision, change_note: note, configuration: form } });
      setRevision(saved.revision); setForm(saved.configuration); setNote("");
      setRefresh((v) => v + 1);
      setSuccess(`Saved ${saved.configuration.name}, revision ${saved.revision}. User access and billing are unchanged.`);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not save plan."); }
    finally { setSaving(false); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
    <Typography component="h1" variant="h3" gutterBottom>Subscription plans</Typography>
    <Button component={Link} to="/admin/subscription-testing" variant="outlined" sx={{ mb: 2 }}>Test sandbox billing</Button>
    <Button component={Link} to="/admin/subscription-observation" variant="outlined" sx={{ mb: 2, ml: 1 }}>Assignments and usage</Button>
    <Alert severity="info" sx={{ mb: 3 }}>Internal catalogue for administrators. Prices, allowances and plan states are proposals only. They do not change the public plans page, assign subscriptions, charge customers or limit radar usage.</Alert>
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}><Typography variant="h6" sx={{ flex: 1 }}>Catalogue</Typography><Button disabled={saving} onClick={reset}>New plan</Button><Button disabled={loading || saving} onClick={() => { setError(""); setRefresh((v) => v + 1); }}>Reload catalogue</Button></Stack>
        {loading ? <Typography role="status">Loading plans…</Typography> : !list.items.length ? <Typography color="text.secondary">No plans yet. Create your first draft below.</Typography> : <Box sx={grid}>
          {list.items.map((plan) => <Paper key={plan.code} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6">{plan.configuration.name}</Typography><Chip size="small" label={title(plan.configuration.state)} /></Stack>
            <Typography color="text.secondary">{plan.code} · Revision {plan.revision}</Typography>
            <Typography sx={{ mt: 1 }}>{plan.configuration.currency} {plan.configuration.monthly_price} / month{plan.configuration.annual_price !== null && ` · ${plan.configuration.currency} ${plan.configuration.annual_price} / year`}</Typography>
            <Typography variant="body2">{plan.configuration.max_digests} digests · {plan.configuration.papers_per_month} papers · {plan.configuration.runs_per_month} runs per monthly allowance period</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>Stripe sandbox: {plan.configuration.stripe_sandbox ? "Mapped; verify before use" : "Not mapped"}</Typography>
            {plan.configuration.stripe_sandbox && <Button disabled={checking !== null || saving} onClick={() => void verify(plan)}>{checking === plan.id ? "Checking Stripe…" : "Check saved revision in Stripe"}</Button>}
            {check?.id === plan.id && (check.error ? <Alert severity="warning">{check.error}</Alert> : check.result && <Alert severity={check.result.matches ? "success" : "warning"}>
              {check.result.matches ? "Sandbox prices match this revision, including explicit inclusive tax behavior." : "Sandbox mapping needs attention."}
              {check.result.issues.map((issue) => <Typography key={issue} variant="body2">{issue}</Typography>)}
              {check.result.prices.map((price) => <Typography key={price.price_id} variant="caption" display="block">{title(price.interval)}: {price.currency.toUpperCase()} {(price.unit_amount / 100).toFixed(2)} · Tax behavior: {price.tax_behavior ?? "Missing"}</Typography>)}
              <Typography variant="caption" display="block">Checked {new Date(check.result.checked_at).toLocaleString()}. This does not enable checkout or verify tax registrations.</Typography>
            </Alert>)}
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button disabled={saving} onClick={() => edit(plan)}>Edit plan</Button><Button onClick={() => { setHistoryCode(plan.code); setHistoryOffset(0); }}>Revision history</Button></Stack>
          </Paper>)}
        </Box>}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}><Button disabled={loading || !offset} onClick={() => setOffset((v) => v - 25)}>Previous</Button><Button disabled={loading || offset + 25 >= list.total} onClick={() => setOffset((v) => v + 25)}>Next</Button></Stack>
      </Paper>
      <Paper id="plan-editor" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Box component="form" onSubmit={save}>
          <Box component="fieldset" disabled={saving} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography variant="h6" gutterBottom>{revision ? `Edit ${code} · based on revision ${revision}` : "Create a draft plan"}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>Every save creates a new revision. To retire a plan, choose Archived; its history remains available. Reviewed means internally reviewed, not available for purchase.</Typography>
            <Box sx={grid}>
              <TextField required label="Plan code" value={code} disabled={!!revision} onChange={(e) => setCode(e.target.value)} inputProps={{ maxLength: 60, pattern: "[a-z][a-z0-9-]{0,59}" }} helperText="Stable identifier: lowercase letters, numbers and hyphens." />
              <TextField required label="Name" value={form.name} onChange={(e) => update("name", e.target.value)} inputProps={{ maxLength: 100 }} />
              <TextField select label="Internal state" value={form.state} onChange={(e) => update("state", e.target.value)}>{["draft", "reviewed", "archived"].map((s) => <MenuItem key={s} value={s}>{title(s)}</MenuItem>)}</TextField>
              <TextField select label="Currency" value={form.currency} onChange={(e) => update("currency", e.target.value)}>{["EUR", "USD", "GBP", "PLN"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
              <TextField required type="number" label="Monthly price" value={form.monthly_price} onChange={(e) => update("monthly_price", e.target.value)} inputProps={{ min: 0, max: 1000000, step: "0.01" }} />
              <TextField type="number" label="Annual price (optional)" value={form.annual_price ?? ""} onChange={(e) => update("annual_price", e.target.value || null)} inputProps={{ min: 0, max: 1000000, step: "0.01" }} helperText="Blank means annual billing is not proposed." />
              <TextField select label="Tax display policy" value={form.tax_display} onChange={(e) => update("tax_display", e.target.value)}>{["undecided", "inclusive", "exclusive"].map((s) => <MenuItem key={s} value={s}>{title(s)}</MenuItem>)}</TextField>
            </Box>
            <TextField fullWidth multiline minRows={2} label="Description" value={form.description} onChange={(e) => update("description", e.target.value)} inputProps={{ maxLength: 1000 }} sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>Proposed allowances</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>Manual runs are part of the total, not additional runs. Monthly allowances also apply to annual plans; no limits are enforced yet. Paper limits currently support up to 30 per run.</Typography>
            <Box sx={grid}>{limits.map(([key, label, min, max]) => <TextField key={key} required type="number" label={label} value={Number.isNaN(form[key]) ? "" : form[key]} onChange={(e) => update(key, e.target.value === "" ? NaN : Number(e.target.value))} inputProps={{ min, max, step: 1 }} />)}</Box>
            <Typography sx={{ mt: 2 }}>Permitted schedule frequencies (none selected = no scheduling)</Typography>
            <Stack direction="row" flexWrap="wrap">{frequencies.map((frequency) => <FormControlLabel key={frequency} label={title(frequency)} control={<Checkbox checked={form.schedule_frequencies.includes(frequency)} onChange={(e) => update("schedule_frequencies", e.target.checked ? [...form.schedule_frequencies, frequency] : form.schedule_frequencies.filter((f) => f !== frequency))} />} />)}</Stack>
            <FormControlLabel label="Email delivery included" control={<Checkbox checked={form.email_delivery} onChange={(e) => update("email_delivery", e.target.checked)} />} />
            <Typography variant="h6" sx={{ mt: 3 }}>Stripe sandbox mapping</Typography>
            <Typography color="text.secondary">Optional identifiers for testing only. Save a revision, then use its catalogue card to check Stripe. Checks read product and price details; they never create payments or modify Stripe. API keys belong in server configuration, not this form.</Typography>
            <FormControlLabel label="Map this plan to Stripe sandbox prices" control={<Checkbox checked={!!form.stripe_sandbox} onChange={(e) => update("stripe_sandbox", e.target.checked ? { product_id: "", monthly_price_id: "", annual_price_id: null } : null)} />} />
            {form.stripe_sandbox && <Box sx={{ ...grid, my: 2 }}>
              <TextField required label="Product ID" value={form.stripe_sandbox.product_id} onChange={(e) => update("stripe_sandbox", { ...form.stripe_sandbox!, product_id: e.target.value })} inputProps={{ pattern: "prod_[A-Za-z0-9]+", maxLength: 255 }} />
              <TextField required label="Monthly Price ID" value={form.stripe_sandbox.monthly_price_id} onChange={(e) => update("stripe_sandbox", { ...form.stripe_sandbox!, monthly_price_id: e.target.value })} inputProps={{ pattern: "price_[A-Za-z0-9]+", maxLength: 255 }} />
              <TextField required={form.annual_price !== null} label="Annual Price ID" value={form.stripe_sandbox.annual_price_id ?? ""} onChange={(e) => update("stripe_sandbox", { ...form.stripe_sandbox!, annual_price_id: e.target.value || null })} inputProps={{ pattern: "price_[A-Za-z0-9]+", maxLength: 255 }} helperText="Required when the plan has an annual price; otherwise leave blank." />
            </Box>}
            <TextField required fullWidth label="Change note" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }} sx={{ my: 2 }} helperText="Explain this revision for other administrators." />
            <Stack direction="row" spacing={2}><Button type="submit" variant="contained">{saving ? "Saving…" : "Save revision"}</Button><Button onClick={reset}>Cancel editing</Button></Stack>
          </Box>
        </Box>
      </Paper>
      {historyCode && <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" gutterBottom>Revision history · {historyCode}</Typography>
        {historyError ? <Alert severity="error">History could not be loaded. Reload the catalogue to retry.</Alert> : !history ? <Typography role="status">Loading history…</Typography> : history.items.map((row) => <Box key={row.id} sx={{ mb: 2 }}>
          <Typography fontWeight={700}>Revision {row.revision} · {title(row.configuration.state)}</Typography>
          <Typography variant="body2">{new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) ? row.created_at : `${row.created_at}Z`).toLocaleString()} · Admin ID: {row.created_by ?? "System or deleted account"}</Typography>
          <Typography>{row.change_note}</Typography>
          <Box component="details"><Box component="summary" sx={{ cursor: "pointer" }}>View saved configuration</Box><Stack spacing={0.5} sx={{ mt: 1 }}>
            <Typography>Name: {row.configuration.name}</Typography>
            <Typography>Description: {row.configuration.description || "None"}</Typography>
            <Typography>Monthly price: {row.configuration.currency} {row.configuration.monthly_price}; annual price: {row.configuration.annual_price === null ? "Not proposed" : `${row.configuration.currency} ${row.configuration.annual_price}`}</Typography>
            <Typography>Tax display: {title(row.configuration.tax_display)}</Typography>
            {limits.map(([key, label]) => <Typography key={key}>{label}: {row.configuration[key]}</Typography>)}
            <Typography>Schedule frequencies: {row.configuration.schedule_frequencies.map(title).join(", ") || "None"}</Typography>
            <Typography>Email delivery: {row.configuration.email_delivery ? "Included" : "Not included"}</Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>Stripe sandbox: {row.configuration.stripe_sandbox ? `${row.configuration.stripe_sandbox.product_id} · Monthly ${row.configuration.stripe_sandbox.monthly_price_id} · Annual ${row.configuration.stripe_sandbox.annual_price_id ?? "Not mapped"}` : "Not mapped"}</Typography>
          </Stack></Box>
        </Box>)}
        <Stack direction="row" spacing={1}><Button disabled={!history || !historyOffset} onClick={() => setHistoryOffset((v) => v - 25)}>Previous</Button><Button disabled={!history || historyOffset + 25 >= history.total} onClick={() => setHistoryOffset((v) => v + 25)}>Next</Button><Button onClick={() => setHistoryCode("")}>Close history</Button></Stack>
      </Paper>}
    </Stack>
  </Container></Box>;
}
