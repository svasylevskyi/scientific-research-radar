import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { digestRunsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import type { DigestRunDetail, DigestRunSummary } from "../types/digest";
import { DigestRunFeedback } from "./DigestRunFeedback";
import { DigestRunProgress } from "./DigestRunProgress";
import { DigestBriefingResult, PaperSummariesResult, TrendAnalysisResult } from "./DigestRunResults";
import { defaultRunId, filterRuns, runDate } from "../runHistory";

export function DigestWorkspace({ digestId, runs, latestRun, details, runBlocked, onRetry, onUpdate }: {
  digestId: string;
  runs: DigestRunSummary[];
  latestRun: DigestRunDetail | null;
  details: ReactNode;
  runBlocked: boolean;
  onRetry: (run: DigestRunDetail) => Promise<void>;
  onUpdate: (run: DigestRunDetail) => void;
}) {
  const { user } = useAuth();
  const storageKey = `digest-runs-collapsed:${user?.id}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
  });
  const [search, setSearch] = useSearchParams();
  const selectedId = search.get("run_id") || defaultRunId(runs);
  const runDays = runs.map((item) => {
    const date = runDate(item.started_at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }).sort();
  const [fromOverride, setFrom] = useState<string | null>(null);
  const [toOverride, setTo] = useState<string | null>(null);
  const from = fromOverride ?? runDays[0] ?? "";
  const to = toOverride ?? runDays.at(-1) ?? "";
  const [tab, setTab] = useState("briefing");
  const [loadedRun, setLoadedRun] = useState<DigestRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const run = latestRun?.id === selectedId ? latestRun : loadedRun?.id === selectedId ? loadedRun : null;

  useEffect(() => {
    setError(null);
    if (latestRun?.id === selectedId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(null); setLoadedRun(null);
    digestRunsApi.get(digestId, selectedId).then((result) => { if (active) setLoadedRun(result); })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Could not load this run."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [digestId, selectedId, latestRun?.id]);

  useEffect(() => { setTab("briefing"); }, [selectedId]);

  // Semantic tab values keep selection stable when available outputs change.
  const available = {
    briefing: Boolean(run?.briefing), trends: Boolean(run?.trend_analysis),
    papers: Boolean(run && (run.search_data || run.relevance_data || run.paper_results.length)),
    steps: true, feedback: run?.status === "completed", details: true,
  };
  const activeTab = available[tab as keyof typeof available] ? tab : "steps";
  const invalidRange = Boolean(from && to && from > to);
  const filtered = filterRuns(runs, from, to);
  const selectionOutsideFilter = !filtered.some((item) => item.id === selectedId);

  function selectRun(id: string) {
    setSearch((current) => { const next = new URLSearchParams(current); next.set("run_id", id); return next; });
    setTab("briefing"); setError(null);
  }

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
      <Paper variant="outlined" sx={{ width: { xs: "100%", md: collapsed ? 64 : 280 }, flexShrink: 0, borderRadius: 3, overflow: "hidden" }}>
        <Tooltip title={collapsed ? "Show run history" : "Hide run history"} arrow>
        <Button aria-label={collapsed ? "Show run history" : "Hide run history"} aria-expanded={!collapsed}
          aria-controls="digest-runs-list" fullWidth onClick={() => {
            const next = !collapsed; setCollapsed(next);
            try { localStorage.setItem(storageKey, String(next)); } catch { /* Storage may be disabled. */ }
          }} sx={{ py: 2 }}>
          {collapsed ? <HistoryRoundedIcon /> : <><ChevronLeftRoundedIcon /> Runs</>}
        </Button>
        </Tooltip>
        {!collapsed && <Box id="digest-runs-list">
          <Stack spacing={2} sx={{ p: 2 }}>
            <TextField label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)}
              error={invalidRange} helperText={invalidRange ? "To must be on or after From." : "Run start dates, in your local time. Both dates included."}
              slotProps={{ inputLabel: { shrink: true } }} />
            {(from || to) && <Button onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>}
            <Typography variant="body2" color="text.secondary">{filtered.length} of {runs.length} runs</Typography>
          </Stack>
          <Stack sx={{ maxHeight: { md: "65vh" }, overflowY: "auto" }}>
            {filtered.map((item) => <Button key={item.id} color="inherit" onClick={() => selectRun(item.id)}
              aria-pressed={item.id === selectedId}
              sx={{ px: 2, py: 1.75, borderRadius: 0, justifyContent: "flex-start", textAlign: "left", bgcolor: item.id === selectedId ? "action.selected" : undefined }}>
              <Stack spacing={0.5}>
                <Typography fontWeight={700}>{runDate(item.started_at).toLocaleString()}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={item.status} color={item.status === "completed" ? "success" : item.status === "failed" ? "error" : "info"} />
                  <Typography variant="body2">{item.paper_count} papers</Typography>
                </Stack>
              </Stack>
            </Button>)}
            {!filtered.length && <Typography color="text.secondary" sx={{ p: 2 }}>No runs match these dates.</Typography>}
          </Stack>
        </Box>}
      </Paper>
      <Box sx={{ minWidth: 0, width: "100%", flex: 1 }}>
        {run && <Typography color="text.secondary" sx={{ mb: 2 }}>
          Run: {runDate(run.started_at).toLocaleString()} · {run.status}
        </Typography>}
        {selectionOutsideFilter && (from || to) && <Alert severity="info" sx={{ mb: 2 }}>The displayed run is outside the date filter. Select a matching run or clear the dates.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
          <Tabs value={activeTab} onChange={(_event, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Digest results and settings">
            <Tab value="briefing" label="Digest Briefing" disabled={!available.briefing} />
            <Tab value="trends" label="Trend Analysis" disabled={!available.trends} />
            <Tab value="papers" label="Paper Summaries" disabled={!available.papers} />
            <Tab value="steps" label="Run Steps" />
            <Tab value="feedback" label="Feedback" disabled={!available.feedback} />
            <Tab value="details" label="Digest Details" />
          </Tabs>
        </Paper>
        <Box role="tabpanel" hidden={activeTab !== "details"}>{details}</Box>
        {activeTab !== "details" && (loading && !run ? <CircularProgress aria-label="Loading run" /> : run && <Box role="tabpanel">
          {activeTab === "briefing" && <DigestBriefingResult run={run} />}
          {activeTab === "trends" && <TrendAnalysisResult run={run} />}
          {activeTab === "papers" && <PaperSummariesResult run={run} />}
          {activeTab === "steps" && <Stack spacing={2}>
            <DigestRunProgress run={run} />
            {run.status === "failed" && <Button disabled={runBlocked || saving} onClick={async () => {
              setSaving(true); try { await onRetry(run); } finally { setSaving(false); }
            }}>Retry failed stage</Button>}
          </Stack>}
          {activeTab === "feedback" && <DigestRunFeedback run={run} editable={run.id === runs[0]?.id && run.status === "completed"}
            isSaving={saving} onSave={async (feedback) => {
              setSaving(true); setError(null);
              try { const updated = await digestRunsApi.updateFeedback(digestId, run.id, feedback); setLoadedRun(updated); onUpdate(updated); }
              catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not save feedback."); }
              finally { setSaving(false); }
            }} />}
        </Box>)}
      </Box>
    </Stack>
  );
}
