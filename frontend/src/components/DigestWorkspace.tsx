import { usePollingResource } from "../hooks/usePollingResource";
import { ResourceNotice } from "./ResourceNotice";
import { RetryRunButton } from "./RetryRunButton";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { SelectedRunOverview } from "./SelectedRunOverview";
import { ApiError } from "../api/client";
import { adminDigestsApi, digestRunsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import type { DigestRunDetail, DigestRunSummary } from "../types/digest";
import { DigestRunFeedback } from "./DigestRunFeedback";
import { DigestRunProgress } from "./DigestRunProgress";
import { AdminRunDiagnostics } from "./AdminRunDiagnostics";
import {
  DigestBriefingResult,
  PaperSummariesResult,
  TrendAnalysisResult,
} from "./DigestRunResults";
import { defaultRunId, filterRuns, runDate, resultTab } from "../runHistory";
import { diagnosticTab, queryPath, updateQuery, withReturnTo, paperQuery, selectedPaperId } from "../navigationContext";

export function DigestWorkspace({
  digestId,
  runs,
  latestRun,
  details,
  runBlocked,
  onRetry,
  onUpdate,
  admin = false,
}: {
  admin?: boolean;
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
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const [search, setSearch] = useSearchParams();
  const selectedId =
    search.get("run_id") || defaultRunId(runs) || runs[0]?.id || "";
  const runDays = runs
    .map((item) => {
      const date = runDate(item.started_at);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    })
    .sort();
  const showInProgress = search.get("run_progress") !== "0";
  const showSuccessful = search.get("run_completed") !== "0";
  const showFailed = search.has("run_failed") ? search.get("run_failed") === "1" : admin;
  const from = search.get("run_from") ?? runDays[0] ?? "";
  const to = search.get("run_to") ?? runDays.at(-1) ?? "";
  const tab = search.get("output_tab") ?? "briefing";
  const adminSection = search.get("run_section") === "output" ? "output" : "diagnostics";
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback((signal: AbortSignal) => !selectedId || latestRun?.id === selectedId
    ? Promise.resolve(null) : admin ? adminDigestsApi.getRun(digestId, selectedId, signal)
      : digestRunsApi.get(digestId, selectedId, signal), [admin, digestId, selectedId, latestRun?.id]);
  const resource = usePollingResource(load, 10000);
  const loadedRun = resource.data;
  const loading = resource.loading && latestRun?.id !== selectedId;
  const run = latestRun?.id === selectedId ? latestRun : loadedRun?.id === selectedId ? loadedRun : null;

  useEffect(() => {
    setError(null);
  }, [selectedId]);

  // Semantic tab values keep selection stable when available outputs change.
  const available = {
    briefing: Boolean(run?.briefing),
    trends: Boolean(run?.trend_analysis),
    papers: Boolean(
      run &&
        (run.search_data || run.relevance_data || run.paper_results.length),
    ),
    steps: !admin,
    feedback: run?.status === "completed",
    details: !admin,
  };
  const activeTab = resultTab(tab, available, admin);
  const targetPaperId = selectedPaperId(search, selectedId);
  const paperHref = (paperId: string) => queryPath(admin ? `/admin/digests/${digestId}/runs` : `/radar/digests/${digestId}`, paperQuery(search, selectedId, paperId, admin));
  const previousView = useRef({ tab: activeTab, paper: targetPaperId, runId: selectedId });
  useEffect(() => {
    // Back from a paper link restores a useful focus point. Polling does not move focus.
    if (run && previousView.current.runId === selectedId && previousView.current.tab === "papers"
      && previousView.current.paper && activeTab !== "papers") {
      document.getElementById(`output-tab-${activeTab}`)?.focus({ preventScroll: true });
    }
    previousView.current = { tab: activeTab, paper: targetPaperId, runId: selectedId };
  }, [activeTab, targetPaperId, selectedId, !!run]);
  const invalidRange = Boolean(from && to && from > to);
  const filtered = filterRuns(runs, from, to).filter((item) => {
    if (item.status === "queued" || item.status === "running")
      return showInProgress;
    if (item.status === "completed") return showSuccessful;
    if (item.status === "failed") return showFailed;
    return false;
  });
  const selectionOutsideFilter = !filtered.some(
    (item) => item.id === selectedId,
  );

  function changeView(values: Record<string, string | null>) {
    // Pin the displayed run so copied tab links do not drift to a newer run.
    const leavesPaper = (values.run_id != null && values.run_id !== selectedId)
      || (values.output_tab != null && values.output_tab !== "papers");
    setSearch(current => updateQuery(current, { run_id: selectedId || null,
      ...(leavesPaper ? { paper_id: null, paper_run_id: null } : {}), ...values }), { preventScrollReset: true });
  }
  const benchmarkPath = withReturnTo("/admin/research-quality", queryPath(`/admin/digests/${digestId}/runs`,
    updateQuery(search, { run_id: selectedId || null, run_section: "diagnostics", diagnostic_tab: "quality" }))) + "#benchmarks";

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={3}
      alignItems="flex-start"
    >
      <Paper
        variant="outlined"
        sx={{
          width: { xs: "100%", md: collapsed ? 64 : 280 },
          flexShrink: 0,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Tooltip
          title={collapsed ? "Show run history" : "Hide run history"}
          arrow
        >
          <Button
            aria-label={collapsed ? "Show run history" : "Hide run history"}
            aria-expanded={!collapsed}
            aria-controls="digest-runs-list"
            fullWidth
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              try {
                localStorage.setItem(storageKey, String(next));
              } catch {
                /* Storage may be disabled. */
              }
            }}
            sx={{ py: 2 }}
          >
            {collapsed ? (
              <HistoryRoundedIcon />
            ) : (
              <>
                <ChevronLeftRoundedIcon /> Runs
              </>
            )}
          </Button>
        </Tooltip>
        {!collapsed && (
          <Box id="digest-runs-list">
            <Stack spacing={2} sx={{ p: 2 }}>
              <TextField
                label="From"
                type="date"
                value={from}
                onChange={(event) => changeView({ run_from: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To"
                type="date"
                value={to}
                onChange={(event) => changeView({ run_to: event.target.value })}
                error={invalidRange}
                helperText={
                  invalidRange
                    ? "To must be on or after From."
                    : "Run start dates, in your local time. Both dates included."
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showInProgress}
                      onChange={(event) =>
                        changeView({ run_progress: event.target.checked ? "1" : "0" })
                      }
                    />
                  }
                  label="Runs in progress"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showSuccessful}
                      onChange={(event) =>
                        changeView({ run_completed: event.target.checked ? "1" : "0" })
                      }
                    />
                  }
                  label="Completed runs"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showFailed}
                      onChange={(event) => changeView({ run_failed: event.target.checked ? "1" : "0" })}
                    />
                  }
                  label="Failed runs"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {filtered.length} of {runs.length} runs
              </Typography>
            </Stack>
            <Stack sx={{ maxHeight: { md: "65vh" }, overflowY: "auto" }}>
              {filtered.map((item) => (
                <Button
                  key={item.id}
                  color="inherit"
                  onClick={() => changeView({ run_id: item.id })}
                  aria-pressed={item.id === selectedId}
                  sx={{
                    px: 2,
                    py: 1.75,
                    borderRadius: 0,
                    justifyContent: "flex-start",
                    textAlign: "left",
                    bgcolor:
                      item.id === selectedId ? "action.selected" : undefined,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Typography fontWeight={700}>
                      {runDate(item.started_at).toLocaleString()}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        label={admin && item.quality_delivery_blocked ? "generated · held" : item.status}
                        color={
                          admin && item.quality_delivery_blocked ? "warning" : item.status === "completed"
                            ? "success"
                            : item.status === "failed"
                              ? "error"
                              : "info"
                        }
                      />
                      <Typography variant="body2">
                        {item.paper_count} papers
                      </Typography>
                    </Stack>
                  </Stack>
                </Button>
              ))}
              {!filtered.length && (
                <Typography color="text.secondary" sx={{ p: 2 }}>
                  No runs match these filters.
                </Typography>
              )}
            </Stack>
          </Box>
        )}
      </Paper>
      <Box sx={{ minWidth: 0, width: "100%", flex: 1 }}>
        {run && (
          <SelectedRunOverview run={run} admin={admin}
            older={runs.some((item) => runDate(item.started_at).getTime() > runDate(run.started_at).getTime())} />
        )}
        {admin && <Stack component="nav" aria-label="Run sections" direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 3 }}>
          <Button variant={adminSection === "diagnostics" ? "contained" : "text"}
            aria-pressed={adminSection === "diagnostics"} aria-controls="admin-run-diagnostics"
            onClick={() => changeView({ run_section: "diagnostics" })}>Run Diagnostics</Button>
          <Button variant={adminSection === "output" ? "contained" : "text"}
            aria-pressed={adminSection === "output"} aria-controls="admin-run-output"
            onClick={() => changeView({ run_section: "output" })}>Run Output</Button>
        </Stack>}
        {selectionOutsideFilter && (
          <Alert severity="info" sx={{ mb: 2 }}>
            The displayed run is outside the current filters. Adjust the filters
            or select a matching run.
          </Alert>
        )}
        <ResourceNotice {...resource} />
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {admin && <AdminRunDiagnostics digestId={digestId} run={run} visible={adminSection === "diagnostics"}
          tab={diagnosticTab(search)} onTabChange={value => changeView({ diagnostic_tab: value })} benchmarkPath={benchmarkPath} />}
        <Box id={admin ? "admin-run-output" : undefined} hidden={admin && adminSection !== "output"}>
        <Paper
          variant="outlined"
          sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}
        >
          <Tabs
            value={activeTab === "none" ? false : activeTab}
            onChange={(_event, value) => changeView({ output_tab: value })}
            variant="scrollable"
            scrollButtons="auto"
            aria-label={admin ? "Run output" : "Digest results and settings"}
            sx={{ "& .MuiTab-root.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
          >
            <Tab
              value="briefing"
              id="output-tab-briefing" aria-controls="digest-output-panel"
              label="Digest Briefing"
              disabled={!available.briefing}
            />
            <Tab
              value="trends"
              id="output-tab-trends" aria-controls="digest-output-panel"
              label="Trend Analysis"
              disabled={!available.trends}
            />
            <Tab
              value="papers"
              id="output-tab-papers" aria-controls="digest-output-panel"
              label="Paper Summaries"
              disabled={!available.papers}
            />
            {!admin && <Tab value="steps" label="Run Steps" id="output-tab-steps" aria-controls="digest-output-panel" />}
            <Tab
              value="feedback"
              id="output-tab-feedback" aria-controls="digest-output-panel"
              label="Feedback"
              disabled={!available.feedback}
            />
            {!admin && <Tab value="details" label="Digest Details" id="output-tab-details" aria-controls="digest-details-panel" />}
          </Tabs>
        </Paper>
        {!admin && <Box role="tabpanel" id="digest-details-panel" aria-labelledby="output-tab-details" tabIndex={0} hidden={activeTab !== "details"}>
          {details}
        </Box>}
        {activeTab !== "details" &&
          (loading && !run ? (
            <CircularProgress aria-label="Loading run" />
          ) : (
            run && (
              <Box role="tabpanel" id="digest-output-panel" tabIndex={0} sx={{ outlineOffset: 2, minWidth: 0 }} aria-labelledby={activeTab === "none" ? undefined : `output-tab-${activeTab}`}>
                {activeTab === "none" && <Alert severity="info">No research output is available for this run. Check Run Diagnostics for execution details.</Alert>}
                {activeTab === "briefing" && <DigestBriefingResult key={run.id} run={run} paperHref={paperHref} />}
                {activeTab === "trends" && <TrendAnalysisResult key={run.id} run={run} paperHref={paperHref} />}
                {activeTab === "papers" && <PaperSummariesResult key={run.id} run={run} targetPaperId={targetPaperId} />}
                {activeTab === "steps" && (
                  <Stack spacing={2}>
                    <DigestRunProgress run={run} />
                    {!admin && run.status === "failed" && (
                      <RetryRunButton
                        digestId={digestId}
                        runId={run.id}
                        disabled={runBlocked || saving}
                        onRetry={async () => {
                          setSaving(true);
                          try {
                            await onRetry(run);
                          } finally {
                            setSaving(false);
                          }
                        }}
                      />
                    )}
                  </Stack>
                )}
                {activeTab === "feedback" && (
                  <DigestRunFeedback
                    run={run}
                    editable={
                      !admin &&
                      run.id === runs[0]?.id &&
                      run.status === "completed"
                    }
                    isSaving={saving}
                    onSave={async (feedback) => {
                      setSaving(true);
                      setError(null);
                      try {
                        const updated = await digestRunsApi.updateFeedback(
                          digestId,
                          run.id,
                          feedback,
                        );
                        await resource.refresh();
                        onUpdate(updated);
                      } catch (caught) {
                        setError(
                          caught instanceof ApiError
                            ? caught.message
                            : "Could not save feedback.",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                  />
                )}
              </Box>
            )
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
