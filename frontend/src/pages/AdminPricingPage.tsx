import { useEffect, useState, type FormEvent } from "react";
import { Alert, Box, Button, Chip, Container, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type PriceInput = { model_name: string; version: string; input_per_million: string;
  cached_input_per_million: string; cache_write_per_million: string; output_per_million: string; web_search_per_call: string; max_input_tokens: string };
type Price = Omit<PriceInput, "max_input_tokens" | "cache_write_per_million"> & { cache_write_per_million?: string | null; max_input_tokens: number; id: number; created_at: string; is_current: boolean };
type PriceList = { items: Price[]; total: number };
const blank: PriceInput = { model_name: "", version: "", input_per_million: "", cached_input_per_million: "", cache_write_per_million: "", output_per_million: "", web_search_per_call: "", max_input_tokens: "" };
const rates = [
  ["input_per_million", "Uncached input / million tokens"],
  ["cached_input_per_million", "Cached input / million tokens"],
  ["cache_write_per_million", "Cache writes / million tokens (optional)"],
  ["output_per_million", "Output / million tokens"],
  ["web_search_per_call", "Web search / call"],
] as const;

export function AdminPricingPage() {
  const [form, setForm] = useState<PriceInput>(blank);
  const [list, setList] = useState<PriceList>({ items: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<PriceList>(`/admin/pricing?offset=${offset}&limit=25`)
      .then((result) => { if (active) setList(result); })
      .catch(() => { if (active) setError("Could not load pricing. Please reload the page."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset, refresh]);
  function update(field: keyof PriceInput, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function copy(row: Price) {
    setForm({ model_name: row.model_name, version: "", input_per_million: row.input_per_million,
      cached_input_per_million: row.cached_input_per_million, cache_write_per_million: row.cache_write_per_million ?? "", output_per_million: row.output_per_million,
      web_search_per_call: row.web_search_per_call, max_input_tokens: String(row.max_input_tokens) });
    setSuccess(false);
    document.getElementById("pricing-form")?.scrollIntoView({ behavior: "smooth" });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setSuccess(false);
    try {
      await apiRequest("/admin/pricing", { method: "POST", body: { ...form, cache_write_per_million: form.cache_write_per_million || null, max_input_tokens: Number(form.max_input_tokens) } });
      setSuccess(true); setForm(blank); setOffset(0); setRefresh((value) => value + 1);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not save pricing."); }
    finally { setSaving(false); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
    <Typography variant="h3" component="h1" gutterBottom>Radar pricing</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Manage estimated research costs in USD. Only the super-admin can view or publish these rates.</Typography>
    <Button component={RouterLink} to="/admin/spending" sx={{ mb: 2 }}>View OpenAI spending</Button>
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">Pricing published. New requests will use this version; existing estimates are unchanged.</Alert>}
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Box component="form" id="pricing-form" onSubmit={save}>
          <Typography variant="h6" gutterBottom>Publish a pricing version</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Use the exact model ID and a new version label. Saving makes this the current tariff for that model immediately, including new requests in an ongoing run. Verify the rates with OpenAI before saving.</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
            <TextField required label="Model ID" value={form.model_name} onChange={(e) => update("model_name", e.target.value)} inputProps={{ maxLength: 100 }} disabled={saving} />
            <TextField required label="Version label" placeholder="2026-09-09-standard-v1" value={form.version} onChange={(e) => update("version", e.target.value)} inputProps={{ maxLength: 100 }} disabled={saving} />
            {rates.map(([key, label]) => <TextField key={key} required={key !== "cache_write_per_million"} label={`${label} (USD)`} type="number" value={form[key]} onChange={(e) => update(key, e.target.value)} inputProps={{ min: 0, step: "any" }} disabled={saving} />)}
            <TextField required label="Maximum input tokens covered" type="number" value={form.max_input_tokens} onChange={(e) => update("max_input_tokens", e.target.value)} inputProps={{ min: 1, max: 2147483647, step: 1 }} disabled={saving} helperText="Larger requests remain unpriced." />
          </Box>
          <Alert severity="info" sx={{ my: 2 }}>These are flat standard-tier estimates. Special tariffs and unsupported service tiers remain unpriced. Requests with cache writes need a cache-write rate; leaving it blank does not mean zero. This does not change OpenAI billing or set a spending limit.</Alert>
          <Stack direction="row" spacing={2}><Button type="submit" variant="contained" disabled={saving}>{saving ? "Saving…" : "Save pricing version"}</Button><Button disabled={saving} onClick={() => setForm(blank)}>Reset form</Button></Stack>
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" gutterBottom>Pricing history</Typography>
        <Typography color="text.secondary">Versions are retained for audit. To change rates, use an existing version as the starting point and publish a new one.</Typography>
        {loading ? <Typography role="status" sx={{ mt: 2 }}>Loading pricing…</Typography> : !list.items.length ? <Alert severity="info" sx={{ mt: 2 }}>No pricing configured. Usage is recorded, but monetary estimates remain unknown until you add a tariff.</Alert> : <TableContainer><Table size="small" aria-label="Pricing history"><TableHead><TableRow>{["Model / version", "Input", "Cached input", "Cache writes", "Output", "Search / call", "Max input", ""].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
          {list.items.map((row) => <TableRow key={row.id}>
            <TableCell>{row.model_name}<br />{row.version} {row.is_current && <Chip size="small" label="Current" />}<Typography variant="caption" display="block">{new Date(row.created_at).toLocaleString()}</Typography></TableCell>
            {rates.map(([key]) => <TableCell key={key}>{row[key] == null ? "Not configured" : `$${row[key]}`}</TableCell>)}
            <TableCell>{row.max_input_tokens}</TableCell><TableCell><Button disabled={saving} onClick={() => copy(row)}>Use as new version</Button></TableCell>
          </TableRow>)}
        </TableBody></Table></TableContainer>}
        <Typography variant="caption">Token prices are USD per million tokens.</Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}><Button disabled={loading || offset === 0} onClick={() => setOffset((v) => Math.max(0, v - 25))}>Previous</Button><Button disabled={loading || offset + 25 >= list.total} onClick={() => setOffset((v) => v + 25)}>Next</Button></Stack>
      </Paper>
    </Stack>
  </Container></Box>;
}
