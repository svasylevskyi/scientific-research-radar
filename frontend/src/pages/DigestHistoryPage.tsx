import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { Link as RouterLink, useLocation, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { digestRunsApi, digestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import type { Digest, DigestRunDetail, DigestRunStatus, DigestRunSummary } from "../types/digest";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusColor(status: DigestRunStatus): "default" | "success" | "error" | "info" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "info";
}

function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null;
  return <Box role="tabpanel" sx={{ pt: 3 }}>{children}</Box>;
}

function BriefingPreview({ run }: { run: DigestRunDetail }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
        <AutoStoriesRoundedIcon color="primary" />
        <Typography variant="h5">{run.briefing?.title ?? "Digest briefing"}</Typography>
      </Stack>
      <Typography color="text.secondary" paragraph>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
        ut labore et dolore magna aliqua.
      </Typography>
      <Typography color="text.secondary">
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
        commodo consequat. This container will later render the persisted briefing data.
      </Typography>
    </Paper>
  );
}

function TrendPreview() {
  return (
    <Stack spacing={2}>
      {["Trend overview", "Emerging signals", "Recommendations"].map((title) => (
        <Paper key={title} variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
            <InsightsRoundedIcon color="primary" />
            <Typography variant="h6">{title}</Typography>
          </Stack>
          <Typography color="text.secondary">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua.
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

function PaperSummariesPreview({ run }: { run: DigestRunDetail }) {
  const papers = run.paper_results;
  if (papers.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6">No paper results stored for this run</Typography>
        <Typography color="text.secondary">
          Paper summary containers will appear here when a run returns papers.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      {papers.map((result) => (
        <Paper key={result.paper.id} variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            spacing={1.5}
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <ArticleRoundedIcon color="primary" />
                <Typography variant="h6">{result.paper.title}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {result.paper.authors.join(", ")} · {result.paper.source_name}
              </Typography>
            </Box>
            <Chip
              color="primary"
              label={`${Math.round(result.relevance_score)} relevance`}
              sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
            />
          </Stack>
          <Typography color="text.secondary">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. This container will later
            show the stored search rationale, relevance assessment, findings, limitations, and
            recommendations for this paper.
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

export function DigestHistoryPage() {
  const { digestId = "" } = useParams();
  const location = useLocation();
  const routeState = location.state as { success?: string } | null;
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunId = searchParams.get("run_id") ?? "";
  const [digest, setDigest] = useState<Digest | null>(null);
  const [runs, setRuns] = useState<DigestRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<DigestRunDetail | null>(null);
  const [tab, setTab] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    Promise.all([
      digestsApi.get(digestId),
      digestRunsApi.list(digestId, { offset: 0, limit: 100 }),
    ])
      .then(([digestResult, historyResult]) => {
        if (!active) return;
        setDigest(digestResult);
        setRuns(historyResult.items);
        const firstRun = historyResult.items[0];
        if (!selectedRunId && firstRun) {
          setSearchParams({ run_id: firstRun.id }, { replace: true });
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load digest history.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [digestId, setSearchParams]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      return;
    }
    let active = true;
    setIsLoadingRun(true);
    setError(null);
    digestRunsApi
      .get(digestId, selectedRunId)
      .then((result) => {
        if (active) setSelectedRun(result);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load this radar run.");
        }
      })
      .finally(() => {
        if (active) setIsLoadingRun(false);
      });
    return () => {
      active = false;
    };
  }, [digestId, selectedRunId]);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button
          component={RouterLink}
          to={`/digests/${digestId}`}
          color="inherit"
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ mb: 2 }}
        >
          Back to digest
        </Button>

        <Typography component="h1" variant="h3" sx={{ mb: 0.75 }}>
          Digest history
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {digest?.topic ?? "Review previous radar runs and their stored output stages."}
        </Typography>
        {routeState?.success && <Alert severity="success" sx={{ mb: 2.5 }}>{routeState.success}</Alert>}
        <Alert severity="info" sx={{ mb: 3 }}>
          These tabs are layout previews. Detailed rendering from the stored stage data will be
          connected in a later iteration.
        </Alert>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {isLoading ? (
          <Box role="status" aria-label="Loading digest history" sx={{ py: 10, display: "grid", placeItems: "center" }}>
            <CircularProgress size={34} />
          </Box>
        ) : runs.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 5, textAlign: "center", borderRadius: 3 }}>
            <Typography variant="h6">This digest has not been run yet</Typography>
            <Typography color="text.secondary">Return to the digest and select Run now.</Typography>
          </Paper>
        ) : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
            <Paper variant="outlined" sx={{ width: { xs: "100%", md: 300 }, borderRadius: 3, overflow: "hidden" }}>
              <Typography variant="h6" sx={{ px: 2.25, pt: 2.25, pb: 1.5 }}>Runs</Typography>
              <Divider />
              <Stack>
                {runs.map((run) => (
                  <Button
                    key={run.id}
                    color="inherit"
                    onClick={() => setSearchParams({ run_id: run.id })}
                    sx={{
                      px: 2.25,
                      py: 1.75,
                      borderRadius: 0,
                      justifyContent: "flex-start",
                      textAlign: "left",
                      bgcolor: selectedRunId === run.id ? "action.selected" : undefined,
                    }}
                  >
                    <Box sx={{ width: "100%" }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography fontWeight={700}>{formatDateTime(run.started_at)}</Typography>
                        <Chip size="small" color={statusColor(run.status)} label={run.status} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {run.paper_count} {run.paper_count === 1 ? "paper" : "papers"} · {run.trigger}
                      </Typography>
                    </Box>
                  </Button>
                ))}
              </Stack>
            </Paper>

            <Box sx={{ minWidth: 0, flex: 1, width: "100%" }}>
              {isLoadingRun || !selectedRun ? (
                <Box role="status" aria-label="Loading radar run" sx={{ py: 8, display: "grid", placeItems: "center" }}>
                  <CircularProgress size={32} />
                </Box>
              ) : (
                <>
                  <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                    <Tabs
                      value={tab}
                      onChange={(_event, nextTab) => setTab(nextTab)}
                      variant="scrollable"
                      scrollButtons="auto"
                      aria-label="Digest run output stages"
                    >
                      <Tab label="Digest Briefing" />
                      <Tab label="Trend Analysis" />
                      <Tab label="Paper Summaries" />
                    </Tabs>
                  </Paper>
                  {selectedRun.status === "failed" && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                      {selectedRun.error_message ?? "This radar run failed."}
                    </Alert>
                  )}
                  <TabPanel active={tab === 0}><BriefingPreview run={selectedRun} /></TabPanel>
                  <TabPanel active={tab === 1}><TrendPreview /></TabPanel>
                  <TabPanel active={tab === 2}><PaperSummariesPreview run={selectedRun} /></TabPanel>
                </>
              )}
            </Box>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
