import { AdminDigestCostSummary } from "../components/AdminDigestCostSummary";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { DigestScheduleControl } from "../components/DigestScheduleControl";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { apiRequest, ApiError } from "../api/client";
import { adminDigestsApi, digestRunsApi, digestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestForm, digestToFormValues } from "../components/DigestForm";
import { DigestRunFeedback } from "../components/DigestRunFeedback";
import { DigestRunProgress } from "../components/DigestRunProgress";
import { DigestWorkspace } from "../components/DigestWorkspace";
import type { AdminDigest, Digest, DigestInput, DigestRunDetail, DigestRunSummary } from "../types/digest";
import { startPagePolling } from "../pagePolling";
import { loadRunHistory } from "../runHistory";

interface DigestDetailPageProps {
  admin?: boolean;
}

function isAdminDigest(digest: Digest): digest is AdminDigest {
  return "owner" in digest;
}

function snapshotTopic(run: DigestRunDetail) {
  const topic = run.digest_snapshot.topic;
  return typeof topic === "string" ? topic : "another digest";
}

export function DigestDetailPage({ admin = false }: DigestDetailPageProps) {
  const { digestId = "" } = useParams();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const routeState = location.state as { success?: string } | null;
  const backPath = admin ? "/admin/digests" : "/radar";
  const [digest, setDigest] = useState<Digest | null>(null);
  const [latestRun, setLatestRun] = useState<DigestRunDetail | null>(null);
  const [access, setAccess] = useState<{ run_allowed: boolean; run_reasons: string[] } | null>(null);
  const [activeRun, setActiveRun] = useState<DigestRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [runTab, setRunTab] = useState(0);
  const [hasRuns, setHasRuns] = useState(false);
  const [runs, setRuns] = useState<DigestRunSummary[]>([]);
  const hasSuccessfulRun = runs.some((run) => run.status === "completed");

  function updateRun(run: DigestRunDetail) {
    setRuns((current) => current.some((item) => item.id === run.id)
      ? current.map((item) => item.id === run.id ? run : item) : [run, ...current]);
    setLatestRun((current) => !current || current.id === run.id ? run : current);
  }
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(routeState?.success ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const scheduleRevision = useRef(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setRuns([]); setLatestRun(null); setActiveRun(null); setRunTab(0);
    setConfirmRun(false);

    async function load() {
      try {
        const digestRequest = admin ? adminDigestsApi.get(digestId) : digestsApi.get(digestId);
        const [digestResult, history, accountActiveRun] = await Promise.all([
          digestRequest,
          admin ? Promise.resolve([]) : loadRunHistory((offset) => digestRunsApi.list(digestId, { offset, limit: 100 })),
          admin ? Promise.resolve(null) : digestRunsApi.active(),
        ]);
        if (!active) return;
        setDigest(digestResult);
        setActiveRun(accountActiveRun);
        setHasRuns(history.length > 0);
        setRuns(history);

        if (accountActiveRun?.digest_id === digestId) {
          setLatestRun(accountActiveRun);
        } else if (history[0]) {
          const detail = await digestRunsApi.get(digestId, history[0].id);
          if (active) setLatestRun(detail);
        } else {
          setLatestRun(null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load this digest.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [admin, digestId]);

  useEffect(() => {
    if (admin || isLoading || isStartingRun) return;
    let mounted = true;
    const trackedRun = activeRun;

    async function refreshProgress() {
      try {
        const revision = scheduleRevision.current;
        const accountActiveRun = await digestRunsApi.active();
        if (!mounted) return;
        // Schedule reads are independent: a failed read must not hide an active run.
        const scheduleRead = digestsApi.get(digestId).then((saved) => {
          if (mounted && revision === scheduleRevision.current) {
            setDigest((current) => current?.id === digestId ? { ...current,
              schedule: saved.schedule, schedule_next_at: saved.schedule_next_at,
              schedule_exhausted: saved.schedule_exhausted } : current);
          }
        }).catch(() => {});
        if (accountActiveRun) {
          setConfirmRun(false);
          setActiveRun(accountActiveRun);
          if (accountActiveRun.digest_id === digestId) { setHasRuns(true); setLatestRun(accountActiveRun); updateRun(accountActiveRun); }
          await scheduleRead;
          return;
        }

        if (trackedRun?.digest_id === digestId) {
          const finished = await digestRunsApi.get(trackedRun.digest_id, trackedRun.id);
          if (!mounted) return;
          setLatestRun(finished);
          updateRun(finished);
          setHasRuns(true);
          setSuccess(finished.status === "completed" ? "Radar run completed." : null);
        }
        setActiveRun(null);
        await scheduleRead;
      } catch {
        // Keep the last known progress; the next poll can recover from a transient error.
      }
    }

    const stop = startPagePolling(refreshProgress, activeRun ? 2500 : 5000);
    return () => { mounted = false; stop(); };
  }, [activeRun?.id, admin, digestId, isLoading, isStartingRun]);

  useEffect(() => {
    if (runTab === 1 && latestRun?.status !== "completed") setRunTab(0);
  }, [latestRun?.id, latestRun?.status, runTab]);

  useEffect(() => {
    if (admin) return;
    let mounted = true;
    setAccess(null);
    const stop = startPagePolling(async () => {
      try {
        const result = await apiRequest<{ run_allowed: boolean; run_reasons: string[] }>(`/subscription?digest_id=${digestId}`);
        if (mounted) setAccess(result);
      } catch { /* Server admission still checks access if a read fails. */ }
    }, 10000);
    return () => { mounted = false; stop(); };
  }, [admin, digestId, digest?.maximum_papers]);

  async function runNow() {
    if (isStartingRun || isSaving || activeRun) return;
    setConfirmRun(false);
    setIsStartingRun(true);
    setError(null);
    setSuccess(null);
    try {
      const run = await digestRunsApi.runNow(digestId);
      setRunTab(0);
      setHasRuns(true);
      setActiveRun(run);
      setLatestRun(run);
      updateRun(run);
      setSearchParams({ run_id: run.id });
      setSuccess("Radar run started. You can continue using the application.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          setActiveRun(await digestRunsApi.active());
        } catch {
          // Preserve the original conflict message.
        }
      }
      setError(caught instanceof ApiError ? caught.message : "Could not start the radar.");
    } finally {
      setIsStartingRun(false);
    }
  }

  async function retryRun(run: DigestRunDetail) {
    setIsStartingRun(true);
    setError(null);
    try {
      const retried = await digestRunsApi.retry(digestId, run.id);
      updateRun(retried); setLatestRun(retried); setActiveRun(retried);
      setSearchParams({ run_id: retried.id });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not retry this run.");
    } finally {
      setIsStartingRun(false);
    }
  }

  async function updateDigest(input: DigestInput) {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = admin
        ? await adminDigestsApi.update(digestId, input)
        : await digestsApi.update(digestId, input);
      setDigest(updated);
      setSuccess("Digest details updated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update this digest.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveFeedback(feedback: string) {
    if (!latestRun) return;
    setIsSavingFeedback(true);
    setError(null);
    try {
      const updated = await digestRunsApi.updateFeedback(digestId, latestRun.id, feedback);
      setLatestRun(updated);
      setSuccess("Feedback saved. It will help refine subsequent runs for this digest.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save your feedback.");
    } finally {
      setIsSavingFeedback(false);
    }
  }

  async function deleteDigest() {
    setIsSaving(true);
    setError(null);
    try {
      if (admin) {
        await adminDigestsApi.delete(digestId);
      } else {
        await digestsApi.delete(digestId);
      }
      navigate(backPath, { replace: true });
    } catch (caught) {
      setConfirmDelete(false);
      setError(caught instanceof ApiError ? caught.message : "Could not delete this digest.");
      setIsSaving(false);
    }
  }

  const runBlocked = activeRun !== null;
  const currentDigestIsRunning = activeRun?.digest_id === digestId;
  const displayedRun = currentDigestIsRunning ? activeRun : latestRun;

  const digestDetails = digest ? (
    <>
      <DigestForm
        key={digest.updated_at}
        initialValues={digestToFormValues(digest)}
        submitLabel="Save changes"
        isSubmitting={isSaving}
        onSubmit={updateDigest}
      />

      <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, mt: 3, borderRadius: 3 }}>
        <Typography variant="h6" color="error.main" sx={{ mb: 0.75 }}>Delete digest</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Permanently removes this digest and its saved configuration.
        </Typography>
        <Button
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlineRoundedIcon />}
          disabled={isSaving || currentDigestIsRunning}
          onClick={() => setConfirmDelete(true)}
        >
          Delete digest
        </Button>
      </Paper>
    </>
  ) : null;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth={!admin && hasSuccessfulRun ? "lg" : "md"} sx={{ py: { xs: 3, sm: 6 } }}>
        <Button
          component={RouterLink}
          to={backPath}
          color="inherit"
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ mb: 2 }}
        >
          {admin ? "Back to digest management" : "Back to workspace"}
        </Button>

        {isLoading ? (
          <Box role="status" aria-label="Loading digest" sx={{ py: 10, display: "grid", placeItems: "center" }}>
            <CircularProgress size={34} />
          </Box>
        ) : !digest ? (
          <Alert severity="error">{error ?? "Digest not found."}</Alert>
        ) : (
          <>
            <Typography component="h1" variant="h3" sx={{ mb: 1 }}>{digest.topic}</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Review and update the research scope and reporting settings.
            </Typography>

            {admin && isAdminDigest(digest) && (
              <Paper variant="outlined" sx={{ p: 2.25, mb: 2.5, borderRadius: 3 }}>
                <Typography variant="caption" color="text.secondary">Digest owner</Typography>
                <Typography fontWeight={700}>{digest.owner.full_name}</Typography>
                <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{digest.owner.email}</Typography>
                <Button
                  component={RouterLink}
                  to={`/admin/digests/${digestId}/runs`}
                  startIcon={<HistoryRoundedIcon />}
                  sx={{ mt: 1.5 }}
                >
                  Review digest runs
                </Button>
              </Paper>
            )}
            {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2.5 }}>{success}</Alert>}

            {admin && <AdminDigestCostSummary key={digestId} digestId={digestId} />}
            {!admin && (
              <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, mb: 3, borderRadius: 3 }}>
                <Typography variant="h6" sx={{ mb: 0.75 }}>Radar controls</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Run research now, schedule recurring runs with optional email delivery, and review past results.
                </Typography>
                <DigestScheduleControl key={digest.id} digestId={digest.id} schedule={digest.schedule} exhausted={digest.schedule_exhausted}
                  onSaved={(saved) => {
                    scheduleRevision.current += 1;
                    setDigest((current) => current?.id === digest.id ? { ...current,
                      schedule: saved?.schedule ?? null, schedule_next_at: saved?.schedule_next_at ?? null,
                      schedule_exhausted: saved?.schedule_exhausted ?? false } : current);
                  }}
                  runButton={
                  <Button
                    variant="contained"
                    startIcon={isStartingRun ? <CircularProgress size={18} color="inherit" /> : <PlayArrowRoundedIcon />}
                    disabled={isStartingRun || isSaving || runBlocked || access?.run_allowed === false}
                    onClick={() => setConfirmRun(true)}
                  >
                    {isStartingRun
                      ? "Starting…"
                      : currentDigestIsRunning
                        ? "Run in progress"
                        : runBlocked
                          ? "Another run is active"
                          : "Run now"}
                  </Button>
                  }
                />

                {access?.run_allowed === false && <Alert severity="warning" sx={{ mt: 2 }}>
                  {access.run_reasons.join(" ")} <Button component={RouterLink} to="/subscription" size="small">Subscription and usage</Button>
                </Alert>}
                {activeRun && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    {currentDigestIsRunning
                      ? "This digest is running. Starting another digest is temporarily disabled for your account."
                      : `A run for “${snapshotTopic(activeRun)}” is in progress. Only one digest can run at a time for your account.`}
                    {!currentDigestIsRunning && (
                      <Button
                        component={RouterLink}
                        to={`/digests/${activeRun.digest_id}`}
                        size="small"
                        sx={{ ml: { sm: 1 } }}
                      >
                        Open active digest
                      </Button>
                    )}
                    {currentDigestIsRunning && hasSuccessfulRun && (
                      <Button size="small" onClick={() => setSearchParams({ run_id: activeRun.id })}>View progress</Button>
                    )}
                  </Alert>
                )}
              </Paper>
            )}

            {!admin && hasSuccessfulRun ? (
              <DigestWorkspace key={digestId} digestId={digestId} runs={runs} latestRun={latestRun}
                details={digestDetails} runBlocked={runBlocked || isStartingRun} onRetry={retryRun} onUpdate={updateRun} />
            ) : !admin && hasRuns && displayedRun ? (
              <Box>
                <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
                  <Tabs
                    value={runTab}
                    onChange={(_event, value) => setRunTab(value)}
                    variant="scrollable"
                    scrollButtons="auto"
                    aria-label="Latest radar run, feedback, and digest details"
                  >
                    <Tab label={currentDigestIsRunning ? "Current Run" : "Latest Run"} />
                    <Tab label="Feedback" disabled={displayedRun.status !== "completed"} />
                    <Tab label="Digest Details" />
                  </Tabs>
                </Paper>
                {runTab === 0 && <Stack spacing={2}>
                  <DigestRunProgress run={displayedRun} />
                  {displayedRun.status === "failed" && <Button disabled={runBlocked || isStartingRun} onClick={() => void retryRun(displayedRun)}>Retry failed stage</Button>}
                </Stack>}
                {runTab === 1 && displayedRun.status === "completed" && (
                  <DigestRunFeedback
                    run={displayedRun}
                    editable={displayedRun.id === latestRun?.id}
                    isSaving={isSavingFeedback}
                    onSave={saveFeedback}
                  />
                )}
                {runTab === 2 && digestDetails}
              </Box>
            ) : digestDetails}
          </>
        )}
      </Container>

      <Dialog open={confirmRun} onClose={() => setConfirmRun(false)} fullWidth maxWidth="xs"
        aria-labelledby="confirm-run-title" aria-describedby="confirm-run-description">
        <DialogTitle id="confirm-run-title">Run this digest now?</DialogTitle>
        <DialogContent>
          <DialogContentText id="confirm-run-description">
            Start a new research run for “{digest?.topic}” using its saved settings?
            You can continue using the application while it runs. Other digest runs
            will be temporarily disabled for your account.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button autoFocus onClick={() => setConfirmRun(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void runNow()}
            disabled={isStartingRun || isSaving || runBlocked || access?.run_allowed === false}>
            Run now
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => {
          if (!isSaving) setConfirmDelete(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete this digest?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {digest
              ? `“${digest.topic}” will be permanently deleted. This action cannot be undone.`
              : "This digest will be permanently deleted."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={isSaving}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteDigest} disabled={isSaving}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
