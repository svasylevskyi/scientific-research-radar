import { Alert, Box, Button, Chip, CircularProgress, Container, FormControlLabel, MenuItem, Pagination, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { researchQualityApi, type QualityConfig, type QualityHistory, type QualitySettings } from "../api/researchQuality";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";

const modes = { off: "Off", observe: "Observe", enforce: "Enforce" };
const rules = [
  ["check_reporting_dates", "Check publication dates against the reporting period"],
  ["check_duplicates", "Check for duplicate DOIs, source URLs, and titles"],
  ["check_source_access", "Check reported source access and summary basis"],
  ["check_evidence_links", "Warn about missing source content or evidence links (observation only)"],
] as const;

export function AdminResearchQualityPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<QualitySettings | null>(null);
  const [config, setConfig] = useState<QualityConfig | null>(null);
  const [threshold, setThreshold] = useState("3");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<QualityHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    researchQualityApi.get().then((value) => {
      if (active) { setSettings(value); setConfig(value.config); setThreshold(String(value.config.sparse_paper_threshold)); setReason(""); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    let active = true;
    setHistory(null); setHistoryError(null);
    researchQualityApi.history(page).then((value) => { if (active) setHistory(value); })
      .catch(() => { if (active) setHistoryError("Could not load settings history."); });
    return () => { active = false; };
  }, [page, settings?.version, reload]);

  const thresholdValid = /^\d+$/.test(threshold) && Number(threshold) <= 30;
  const editable = !!user?.is_super_admin && !loading && !saving;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || !config || !editable || !thresholdValid || !reason.trim()) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const value = await researchQualityApi.save({ expected_version: settings.version,
        config: { ...config, sparse_paper_threshold: Number(threshold) }, change_reason: reason.trim() });
      setSettings(value); setConfig(value.config); setReason(""); setPage(1);
      setSuccess(`Version ${value.version} saved. These settings apply to new runs.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save settings."); }
    finally { setSaving(false); }
  }

  return <Box><AppHeader /><Container component="main" maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
    <Stack spacing={3}>
      <Box><Typography component="h1" variant="h3">Research quality</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Deterministic checks of research output. These checks do not verify whether scientific claims are true.</Typography></Box>
      {settings && <Stack direction="row" spacing={1} alignItems="center"><Chip label={`Active mode: ${modes[settings.config.mode ?? "observe"]}`} />
        <Typography variant="body2">Settings version {settings.version}</Typography></Stack>}
      <Button disabled={loading || saving} onClick={() => { setSuccess(null); setReload((value) => value + 1); }} sx={{ alignSelf: "flex-start" }}>Reload settings</Button>
      {!user?.is_super_admin && <Typography color="text.secondary">All admins can review these settings. Only super-admins can change them.</Typography>}
      {loading ? <CircularProgress aria-label="Loading quality settings" /> : config && settings && <Paper component="form" onSubmit={save} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>
          <TextField select label="Quality gate mode" value={config.mode} disabled={!editable}
            onChange={(event) => setConfig({ ...config, mode: event.target.value as QualityConfig["mode"] })}>
            <MenuItem value="off">Off — do not evaluate new runs</MenuItem>
            <MenuItem value="observe">Observe — record findings without blocking delivery</MenuItem>
            <MenuItem value="enforce">Enforce — block delivery of held output</MenuItem>
          </TextField>
          {config.mode === "enforce" && <Alert severity="warning">Held output remains available for review and cannot be emailed. Generated runs still count against existing allowances. Agree the customer allowance policy before enabling Enforce for paying users.</Alert>}
          <Typography variant="body2" color="text.secondary">Each run keeps its settings snapshot, including retries. Changing modes does not release held output or re-evaluate earlier runs. Manual release and automatic correction are not included yet.</Typography>
          <Typography component="h2" variant="h6">Optional checks</Typography>
          <TextField select label="Independent source verification" value={config.source_verification_mode ?? "observe"} disabled={!editable}
            onChange={(event) => setConfig({ ...config, source_verification_mode: event.target.value as QualityConfig["source_verification_mode"] })}>
            <MenuItem value="off">Off — disable independent metadata checks</MenuItem>
            <MenuItem value="observe">Observe — record metadata limitations as warnings</MenuItem>
            <MenuItem value="enforce">Enforce — confirmed metadata conflicts cause Hold</MenuItem>
          </TextField>
          <Typography variant="body2" color="text.secondary">Checks DOI/arXiv metadata using external requests, without OpenAI. Unavailable sources and provider errors produce warnings. Conflicts block automatic delivery only when both modes are Enforce. Automatic metadata checks are skipped when the quality gate is Off; manual checks remain available unless source verification itself is Off. Retrieving permitted source content for new summaries is separate and remains active.</Typography>
          {rules.map(([key, label]) => <FormControlLabel key={key} label={label} control={<Switch checked={!!config[key]} disabled={!editable} onChange={(_, checked) => setConfig({ ...config, [key]: checked })} />} />)}
          <Typography variant="body2" color="text.secondary">Content reuse permissions are always required, including when quality checks are Off. This switch controls evidence warnings, not permission enforcement or content retrieval.</Typography>
          <TextField label="Warn when fewer papers are selected" type="number" value={threshold} disabled={!editable}
            onChange={(event) => setThreshold(event.target.value)} error={!thresholdValid}
            helperText="0–30. Set 0 to disable this warning. Sparse results never cause a hold by themselves."
            slotProps={{ htmlInput: { min: 0, max: 30, step: 1 } }} />
          <Typography variant="body2">Required content, selected-paper coverage, and evidence-reference consistency are always checked in Observe and Enforce. Existing schema, security, and reference-integrity validation remains active even when quality gates are Off.</Typography>
          {user?.is_super_admin && <>
            <TextField label="Reason for change" multiline minRows={2} required value={reason} disabled={!editable}
              onChange={(event) => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            <Button type="submit" variant="contained" disabled={!editable || !thresholdValid || !reason.trim()} sx={{ alignSelf: "flex-start" }}>{saving ? "Saving…" : "Save settings"}</Button>
          </>}
        </Stack>
      </Paper>}
      {error && <Alert severity="error" action={<Button disabled={saving} onClick={() => { setSuccess(null); setReload((value) => value + 1); }}>Reload</Button>}>{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Box><Typography component="h2" variant="h5" sx={{ mb: 2 }}>Settings history</Typography>
        {historyError ? <Alert severity="error" action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>}>{historyError}</Alert> : !history ? <CircularProgress aria-label="Loading settings history" /> : <Stack spacing={2}>
          {!history.items.length && <Typography color="text.secondary">No changes yet. Built-in Observe defaults are active.</Typography>}
          {history.items.map((item) => <Paper key={item.version} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
            <Typography fontWeight={700}>Version {item.version} · {modes[item.config.mode ?? "observe"]}</Typography>
            <Typography variant="body2" color="text.secondary">{item.created_by_name} · {item.created_at ? new Date(/[Zz]|[+-]\d\d:\d\d$/.test(item.created_at) ? item.created_at : `${item.created_at}Z`).toLocaleString() : "Built-in defaults"}</Typography>
            <Typography sx={{ my: 1 }}>{item.change_reason}</Typography>
            <Typography variant="body2">Source verification: {modes[item.config.source_verification_mode ?? "observe"]}</Typography>
            <Typography variant="body2">Dates: {item.config.check_reporting_dates ? "on" : "off"} · Duplicates: {item.config.check_duplicates ? "on" : "off"} · Source access: {item.config.check_source_access ? "on" : "off"} · Sparse warning below {item.config.sparse_paper_threshold} papers</Typography>
          </Paper>)}
          {history.total > 20 && <Pagination count={Math.ceil(history.total / 20)} page={page} onChange={(_, value) => setPage(value)} />}
        </Stack>}
      </Box>
    </Stack>
  </Container></Box>;
}
