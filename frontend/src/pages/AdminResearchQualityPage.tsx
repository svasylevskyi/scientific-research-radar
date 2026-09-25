import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress, Container, Pagination, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { researchQualityApi, type QualityConfig, type QualityHistory, type QualitySettings } from "../api/researchQuality";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { BenchmarkReviewPanel } from "../components/BenchmarkReviewPanel";
import { defaultClaimReview } from "../components/ClaimReviewSettings";
import { QualityPolicySettings } from "../components/QualityPolicySettings";

const modes = { off: "Off", observe: "Observe", enforce: "Enforce" };
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
      setSuccess(`Version ${value.version} saved. Run settings apply to new runs; AI reviewer controls apply to new manual reviews. Switching the AI reviewer Off also stops further queued requests.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save settings."); }
    finally { setSaving(false); }
  }

  return <Box><AppHeader /><Container component="main" maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
    <Stack spacing={3}>
      <Box><Typography component="h1" variant="h3">Research quality</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Configure research checks and optional AI observations. Findings help identify issues; they do not certify scientific truth.</Typography></Box>
      {settings && <Stack direction="row" spacing={1} alignItems="center"><Chip label={`Automatic checks: ${modes[settings.config.mode ?? "observe"]}`} />
        <Typography variant="body2">Settings version {settings.version}</Typography></Stack>}
      <Button disabled={loading || saving} onClick={() => { setSuccess(null); setReload((value) => value + 1); }} sx={{ alignSelf: "flex-start" }}>Reload settings</Button>
      {!user?.is_super_admin && <Typography color="text.secondary">All admins can review these settings. Only super-admins can change them.</Typography>}
      {loading ? <CircularProgress aria-label="Loading quality settings" /> : config && settings && <Paper component="form" onSubmit={save} variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>
          <QualityPolicySettings config={config} onChange={setConfig} editable={editable}
            threshold={threshold} setThreshold={setThreshold} thresholdValid={thresholdValid} />
          {user?.is_super_admin && <>
            <TextField label="Reason for change" multiline minRows={2} required value={reason} disabled={!editable}
              onChange={(event) => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            <Button type="submit" variant="contained" disabled={!editable || !thresholdValid || !reason.trim()} sx={{ alignSelf: "flex-start" }}>{saving ? "Saving…" : "Save all settings"}</Button>
          </>}
        </Stack>
      </Paper>}
      {error && <Alert severity="error" action={<Button disabled={saving} onClick={() => { setSuccess(null); setReload((value) => value + 1); }}>Reload</Button>}>{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography component="span" variant="h6">Settings history</Typography></AccordionSummary>
        <AccordionDetails>
        {historyError ? <Alert severity="error" action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>}>{historyError}</Alert> : !history ? <CircularProgress aria-label="Loading settings history" /> : <Stack spacing={2}>
          {!history.items.length && <Typography color="text.secondary">No changes yet. Built-in Observe defaults are active.</Typography>}
          {history.items.map((item) => <Paper key={item.version} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
            <Typography fontWeight={700}>Version {item.version} · {modes[item.config.mode ?? "observe"]}</Typography>
            <Typography variant="body2" color="text.secondary">{item.created_by_name} · {item.created_at ? new Date(/[Zz]|[+-]\d\d:\d\d$/.test(item.created_at) ? item.created_at : `${item.created_at}Z`).toLocaleString() : "Built-in defaults"}</Typography>
            <Typography sx={{ my: 1 }}>{item.change_reason}</Typography>
            <Typography variant="body2">Source verification: {modes[item.config.source_verification_mode ?? "observe"]}</Typography>
            <Typography variant="body2">AI reviewer: {item.config.claim_review?.mode ?? "off"} · {item.config.claim_review?.model ?? defaultClaimReview.model} · Per-review limit ${item.config.claim_review?.max_review_usd ?? defaultClaimReview.max_review_usd} · Daily reservation budget ${item.config.claim_review?.daily_budget_usd ?? defaultClaimReview.daily_budget_usd}</Typography>
            <Typography variant="body2">AI limits: {item.config.claim_review?.max_claims ?? defaultClaimReview.max_claims} claims per review · {item.config.claim_review?.max_output_tokens ?? defaultClaimReview.max_output_tokens} output tokens per claim · {item.config.claim_review?.daily_call_limit ?? defaultClaimReview.daily_call_limit} calls per UTC day</Typography>
            <Typography variant="body2">Dates: {item.config.check_reporting_dates ? "on" : "off"} · Duplicates: {item.config.check_duplicates ? "on" : "off"} · Source access: {item.config.check_source_access ? "on" : "off"} · Sparse warning below {item.config.sparse_paper_threshold} papers</Typography>
          </Paper>)}
          {history.total > 20 && <Pagination count={Math.ceil(history.total / 20)} page={page} onChange={(_, value) => setPage(value)} />}
        </Stack>}
        </AccordionDetails>
      </Accordion>
      <BenchmarkReviewPanel />
    </Stack>
  </Container></Box>;
}
