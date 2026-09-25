import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Pagination, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { researchQualityApi, type QualityEvaluation } from "../api/researchQuality";
import { loadRunQualityResults, type QualityPages } from "../api/runQualityResults";
import { usePollingResource } from "../hooks/usePollingResource";
import type { DigestRunDetail } from "../types/digest";
import { aiSummary, evidenceSummary, isEvidenceFinding, qualityLabels, sourceSummary, structuralAssessment } from "../qualityOverview";
import { runDate } from "../runHistory";
import { QualityDetails, ResearchQualityNotice } from "./ResearchQualityNotice";
import { AdminSourceVerification } from "./AdminSourceVerification";
import { AdminSourceContent } from "./AdminSourceContent";
import { ClaimReviewControls } from "./ClaimReviewPanel";

function QualitySection({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return <Accordion>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack spacing={0.5}>
      <Typography component="span" variant="subtitle1" fontWeight={700}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{summary}</Typography>
    </Stack></AccordionSummary>
    <AccordionDetails><Stack spacing={2}>{children}</Stack></AccordionDetails>
  </Accordion>;
}

export function AdminRunQuality({ digestId, run }: { digestId: string; run: DigestRunDetail }) {
  const [pages, setPages] = useState<QualityPages>({ evaluations: 1, sources: 1, reviews: 1 });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<QualityEvaluation | null>(null);
  const load = useCallback(() => loadRunQualityResults(digestId, run.id, pages), [digestId, run.id, pages]);
  const resource = usePollingResource(load, 30000, true);
  const data = resource.data;
  const currentRun = data?.run ?? run;
  const latest = saved && (!data?.latestEvaluation || runDate(saved.created_at) > runDate(data.latestEvaluation.created_at)) ? saved : data?.latestEvaluation;
  const local = structuralAssessment(currentRun, latest);
  const canEvaluate = currentRun.status === "completed" && !!data && !resource.error && !resource.loading;
  const setPage = (key: keyof QualityPages, page: number) => setPages(old => old[key] === page ? old : { ...old, [key]: page });

  async function refresh() {
    setRefreshing(true);
    try { await resource.refresh(); }
    finally { setRefreshing(false); }
  }
  async function evaluate() {
    if (!canEvaluate || !data || pending.current) return;
    pending.current = true;
    setSaving(true); setError(""); setSaved(null);
    try {
      setSaved(await researchQualityApi.evaluate(digestId, run.id, data.settings.version));
      setPage("evaluations", 1);
      await resource.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Quality evaluation failed. Please retry."); }
    finally { pending.current = false; setSaving(false); }
  }

  return <Stack spacing={2}>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}>
      <Typography component="h2" variant="h6">Quality overview</Typography>
      <Button variant="outlined" disabled={refreshing || resource.loading} onClick={() => void refresh()}>{refreshing ? "Refreshing results…" : "Refresh results"}</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">Refresh reloads saved results only, with no external service requests or LLM calls. Expand an area to inspect results or run a check.</Typography>
    {resource.loading && <Typography role="status">Loading saved quality results…</Typography>}
    {resource.error && <Alert severity="warning">{data ? "Saved results may be outdated. Check actions are paused until refresh succeeds. " : "Could not load saved quality results. "}{resource.error}</Alert>}
    <Paper variant="outlined" sx={{ p: 2 }}><ResearchQualityNotice run={currentRun} admin /></Paper>
    <Box>
      <QualitySection title="Structural checks" summary={`${qualityLabels[local.status]} · ${latest ? "Latest manual check" : "Original automatic check"}`}>
        <Typography variant="body2" color="text.secondary">Check saved output for missing content, inconsistent references, dates, duplicates, and coverage. This is a local consistency check, not factual verification. The same action also records configured evidence-link warnings.</Typography>
        <Typography variant="body2">Uses current settings{data ? ` (version ${data.settings.version})` : ""}, even when automatic checks are Off. No external requests or LLM charges.</Typography>
        <Button variant="outlined" sx={{ alignSelf: "flex-start" }} disabled={!canEvaluate || saving} onClick={() => void evaluate()}>{saving ? "Evaluating…" : "Run local checks"}</Button>
        {currentRun.status !== "completed" && <Typography variant="body2">Manual checks require a completed run.</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">Manual evaluation saved.</Alert>}
        {latest && <Typography variant="body2">{runDate(latest.created_at).toLocaleString()} · {latest.created_by_name}</Typography>}
        <QualityDetails {...local} />
        {!!data?.evaluations.total && <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Local evaluation history · {data.evaluations.total}</Typography></AccordionSummary>
          <AccordionDetails><Stack spacing={2}>
            {data.evaluations.items.map(evaluation => <Box key={evaluation.id} sx={{ overflowWrap: "anywhere" }}>
              <Typography fontWeight={700}>{qualityLabels[evaluation.status]} · {runDate(evaluation.created_at).toLocaleString()}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>{evaluation.created_by_name} · Structural and evidence-link findings</Typography>
              <QualityDetails config={evaluation.config} findings={evaluation.findings} status={evaluation.status} />
            </Box>)}
            {data.evaluations.total > 20 && <Pagination count={Math.ceil(data.evaluations.total / 20)} page={pages.evaluations} disabled={saving} onChange={(_, value) => setPage("evaluations", value)} aria-label="Quality evaluation history pages" />}
          </Stack></AccordionDetails>
        </Accordion>}
      </QualitySection>
      <QualitySection title="Source verification" summary={data ? sourceSummary(data.latestSource) : "Results unavailable"}>
        {data && <AdminSourceVerification digestId={digestId} run={currentRun} settings={data.settings} history={data.sources} page={pages.sources} setPage={page => setPage("sources", page)} stale={!!resource.error || resource.loading} refresh={resource.refresh} />}
      </QualitySection>
      <QualitySection title="Evidence availability" summary={data ? evidenceSummary(data.content) : "Results unavailable"}>
        {(latest?.findings ?? currentRun.quality_findings).filter(isEvidenceFinding).map(finding => <Alert key={finding.code} severity="info">{finding.message}</Alert>)}
        {data && <AdminSourceContent content={data.content} />}
      </QualitySection>
      <QualitySection title="AI observations" summary={data ? aiSummary(data.latestReview) : "Results unavailable"}>
        <ClaimReviewControls digestId={digestId} runId={run.id} completed={currentRun.status === "completed"}
          page={pages.reviews} setPage={page => setPage("reviews", page)} latestReview={data?.latestReview}
          resource={{ ...resource, data: data ? { settings: data.settings, history: data.reviews } : null }} />
      </QualitySection>
    </Box>
  </Stack>;
}
