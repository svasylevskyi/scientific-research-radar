import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Pagination, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { claimReviewsApi, type ClaimReview, type ClaimReviewStart, type ClaimReviewTarget } from "../api/claimReviews";
import { ApiError } from "../api/client";
import { downloadJson } from "../api/benchmarkReview";
import { researchQualityApi, type QualitySettings } from "../api/researchQuality";
import { usePollingResource } from "../hooks/usePollingResource";

type Props = { digestId: string; runId: string; completed: boolean } | { benchmarkId: string; latestPublication: number | null };
const title = (value: string) => value.replaceAll("_", " ");

function Comparison({ report }: { report: NonNullable<ClaimReview["report"]> }) {
  const candidate = report.candidate as { metrics?: Record<string, unknown> } | undefined;
  const metrics = candidate?.metrics ?? {};
  const percent = (value: unknown) => typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "Not measurable";
  const reasons = [...(Array.isArray(report.readiness_reasons) ? report.readiness_reasons : []), ...(Array.isArray(report.failures) ? report.failures : [])];
  return <Box>
    <Typography fontWeight={700}>Benchmark comparison: {title(String(report.decision))}</Typography>
    <Typography variant="body2">Accuracy: {percent(metrics.accuracy)} · Coverage: {percent(metrics.prediction_coverage)} · False acceptance: {percent(metrics.false_acceptance_rate)}</Typography>
    {reasons.map((reason, index) => <Typography key={index} variant="body2" color="text.secondary">{String(reason)}</Typography>)}
    <Typography variant="body2" color="text.secondary">A benchmark pass does not establish launch readiness or scientific truth.</Typography>
  </Box>;
}

function ReviewDetails({ review }: { review: ClaimReview }) {
  return <Stack spacing={2}>
    <Typography variant="body2">{review.created_by_name} · {new Date(review.created_at).toLocaleString()} · {review.model} · Settings {review.settings_version}</Typography>
    <Typography variant="body2">{review.completed_claims} of {review.selected_claims} selected claims reviewed; {review.total_claims} claims available. Known cost: ${Number(review.known_estimated_usd).toFixed(6)} · Unknown-cost requests: {review.unknown_requests} · Reserved: ${Number(review.reserved_usd).toFixed(4)}.</Typography>
    {review.selected_claims < review.total_claims && <Alert severity="info">This is a partial review. Claims beyond the configured limit were not assessed.</Alert>}
    {review.error && <Alert severity="warning">{review.error}</Alert>}
    {review.report && <Comparison report={review.report} />}
    {review.cases.map(item => <Accordion key={item.case_id}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack spacing={0.5}>
        <Typography variant="body2" fontWeight={700}>{title(item.verdict ?? item.status)} · {title(item.scope)}</Typography>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{item.claim}</Typography>
      </Stack></AccordionSummary>
      <AccordionDetails><Stack spacing={1}>
        {item.rationale && <Typography>{item.rationale}</Typography>}
        <Typography variant="body2" color="text.secondary">Cost: {item.estimated_usd == null ? "Unknown" : `$${Number(item.estimated_usd).toFixed(6)}`} · Time: {item.latency_seconds == null ? "Unknown" : `${item.latency_seconds.toFixed(1)} s`}</Typography>
        <Typography variant="body2">Evidence: {item.evidence_passage_ids?.join(", ") || "No passage references"}</Typography>
        {item.sources?.map((source, index) => <Box key={index} sx={{ overflowWrap: "anywhere" }}>
          <Typography fontWeight={700}>{String(source.title ?? "Source evidence")}</Typography>
          <Typography variant="body2">{Array.isArray(source.authors) ? source.authors.join(", ") : ""} · {title(String(source.basis ?? ""))}</Typography>
          {typeof source.source_url === "string" && <Link href={source.source_url} target="_blank" rel="noopener noreferrer">Source</Link>}
          {typeof source.license_url === "string" && <> · <Link href={source.license_url} target="_blank" rel="noopener noreferrer">Licence</Link></>}
          {typeof source.permission_url === "string" && <> · <Link href={source.permission_url} target="_blank" rel="noopener noreferrer">Permission record</Link></>}
          <Typography variant="body2" color="text.secondary">{String(source.rights_notice ?? source.permission_note ?? "")}</Typography>
          {Array.isArray(source.passages) && source.passages.map((passage: { id: string; text: string }) => <Box key={passage.id} sx={{ my: 1 }}>
            <Typography variant="caption">{passage.id}</Typography><Typography variant="body2">{passage.text}</Typography>
          </Box>)}
        </Box>)}
      </Stack></AccordionDetails>
    </Accordion>)}
  </Stack>;
}

export function ClaimReviewPanel(props: Props) {
  const digestId = "digestId" in props ? props.digestId : null;
  const runId = "runId" in props ? props.runId : null;
  const benchmarkId = "benchmarkId" in props ? props.benchmarkId : null;
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    const target: ClaimReviewTarget = digestId && runId ? { digest_id: digestId, run_id: runId } : { benchmark_id: benchmarkId! };
    const [settings, history] = await Promise.all([researchQualityApi.get(), claimReviewsApi.history(target, page)]);
    return { settings, history };
  }, [digestId, runId, benchmarkId, page]);
  const resource = usePollingResource(load, 15000);
  return <ClaimReviewControls {...props} resource={resource} page={page} setPage={setPage} showRefresh />;
}

type ReviewResource = {
  data: { settings: QualitySettings; history: Awaited<ReturnType<typeof claimReviewsApi.history>> } | null;
  loading: boolean; error: string; refresh: () => Promise<void>;
};

/** Controls shared by the run overview and the standalone benchmark workspace. */
export function ClaimReviewControls(props: Props & {
  resource: ReviewResource; page: number; setPage: (page: number) => void;
  showRefresh?: boolean; latestReview?: ClaimReview | null;
}) {
  const { resource, page, setPage, showRefresh = false } = props;
  const digestId = "digestId" in props ? props.digestId : null;
  const runId = "runId" in props ? props.runId : null;
  const benchmarkId = "benchmarkId" in props ? props.benchmarkId : null;
  const latestPublication = "latestPublication" in props ? props.latestPublication : null;
  const [split, setSplit] = useState<"development" | "heldout">("development");
  const [publication, setPublication] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ClaimReview | null>(null);
  const [detailError, setDetailError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = useRef(false);
  // Keep an idempotency key after uncertain transport errors; Retry cannot create
  // another paid job. A successful response consumes the key.
  const pendingPayload = useRef<ClaimReviewStart | null>(null);
  const config = resource.data?.settings.config.claim_review;
  const jobs = resource.data?.history.items ?? [];
  const selected = jobs.find(job => job.id === selectedId);
  const detailVersion = selected ? `${selected.id}:${selected.status}:${selected.completed_claims}:${selected.unknown_requests}` : "";
  useEffect(() => {
    if (!selectedId || !detailVersion) return;
    const controller = new AbortController();
    setDetailError("");
    claimReviewsApi.detail(selectedId, controller.signal).then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(caught => { if (!controller.signal.aborted) setDetailError(caught instanceof Error ? caught.message : "Could not load review details."); });
    return () => controller.abort();
  }, [selectedId, detailVersion, resource.data?.history]);
  const active = [props.latestReview, ...jobs].some(job => job?.status === "queued" || job?.status === "running");
  const number = Number(publication || latestPublication || 0);
  const canStart = !!resource.data && !resource.error && !resource.loading && !busy && !active && config?.mode === "observe"
    && ("completed" in props ? props.completed : Number.isInteger(number) && number > 0 && number <= (latestPublication ?? 0));

  async function start() {
    if (!canStart || !resource.data || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setConfirm(false);
    pendingPayload.current ??= { request_id: crypto.randomUUID(), expected_settings_version: resource.data.settings.version,
      ...(digestId && runId ? { digest_id: digestId, run_id: runId } : { benchmark_id: benchmarkId!, publication: number, split }) };
    try {
      await claimReviewsApi.start(pendingPayload.current);
      pendingPayload.current = null; setPage(1); await resource.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) pendingPayload.current = null;
      setError(caught instanceof Error ? caught.message : "Could not start the review.");
    }
    finally { pending.current = false; setBusy(false); }
  }
  async function exportReview(id: string) {
    setBusy(true); setError("");
    try { downloadJson(`radar-ai-review-${id}.json`, await claimReviewsApi.export(id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not export review."); }
    finally { setBusy(false); }
  }
  return <Stack spacing={2}>
    {showRefresh && <Typography component="h2" variant="h6">AI claim review</Typography>}
    <Chip sx={{ alignSelf: "flex-start" }} size="small" label={config?.mode === "observe" ? "Manual reviewer enabled · Paid OpenAI calls" : "Manual reviewer off"} />
    <Typography variant="body2" color="text.secondary">{benchmarkId ? "Compare the AI reviewer with a published human benchmark. Human labels are never sent to the model." : "Assess paper summaries and key findings against their saved permitted excerpts. Trends and the complete briefing are not assessed in this increment."} These are AI observations, not human approval; delivery and allowances remain unchanged.</Typography>
    {benchmarkId && <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField type="number" label="Published revision" value={publication || latestPublication || ""} disabled={busy || active || !!pendingPayload.current}
        onChange={event => setPublication(event.target.value)} slotProps={{ htmlInput: { min: 1, max: latestPublication ?? 1, step: 1 } }} helperText={latestPublication ? `Latest: ${latestPublication}` : "Complete human review and publish a revision first."} />
      <TextField select label="Comparison split" value={split} disabled={busy || active || !!pendingPayload.current}
        onChange={event => setSplit(event.target.value as typeof split)}>
        <MenuItem value="development">Development</MenuItem><MenuItem value="heldout">Held-out</MenuItem>
      </TextField>
    </Stack>}
    {config?.mode === "off" && <Typography variant="body2">A super-admin can enable this reviewer in Research quality settings.</Typography>}
    {active && <Typography role="status">Review in progress. You can leave this page; results will be saved.</Typography>}
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Button variant="outlined" disabled={!canStart} onClick={() => setConfirm(true)}>{benchmarkId ? "Compare AI with benchmark (paid)" : "Review claims with AI (paid)"}</Button>
      {showRefresh && <Button disabled={busy || resource.loading} onClick={() => void resource.refresh()}>Refresh AI reviews</Button>}
    </Stack>
    {(error || (showRefresh && resource.error)) && <Alert severity="error">{error || resource.error}</Alert>}
    {!resource.loading && !jobs.length && <Typography variant="body2">No AI reviews have been recorded.</Typography>}
    {jobs.map(job => <Accordion key={job.id} expanded={selectedId === job.id} onChange={(_, expanded) => { setError(""); setSelectedId(expanded ? job.id : null); }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{new Date(job.created_at).toLocaleString()} · {title(job.status)} · {job.completed_claims}/{job.selected_claims} claims{job.publication ? ` · Publication ${job.publication} / ${job.split}` : ""}</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        {selectedId === job.id && detailError && <Alert severity="error">{detailError}</Alert>}
        {(!detail || detail.id !== job.id || detail.status !== job.status || detail.completed_claims !== job.completed_claims) && !detailError && <Typography role="status">Loading review details…</Typography>}
        <ReviewDetails review={detail?.id === job.id && detail.status === job.status && detail.completed_claims === job.completed_claims ? detail : job} />
        <Button disabled={busy} onClick={() => void exportReview(job.id)} sx={{ alignSelf: "flex-start" }}>Download review and comparison</Button>
      </Stack></AccordionDetails>
    </Accordion>)}
    {(resource.data?.history.total ?? 0) > 5 && <Pagination page={page} count={Math.ceil(resource.data!.history.total / 5)} disabled={busy} onChange={(_, value) => setPage(value)} aria-label="AI review history pages" />}
    <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="ai-review-confirm-title">
      <DialogTitle id="ai-review-confirm-title">Start paid AI review?</DialogTitle>
      <DialogContent><Typography>This will submit up to {config?.max_claims} OpenAI calls, within a configured ${config?.max_review_usd} estimate limit. Only saved permitted excerpts are used. Results will not change delivery or subscriber allowances.</Typography>
        {split === "heldout" && benchmarkId && <Typography sx={{ mt: 2 }}>Use held-out cases for planned evaluation, not repeated prompt tuning.</Typography>}
      </DialogContent>
      <DialogActions><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="contained" disabled={!canStart} onClick={() => void start()}>Start review</Button></DialogActions>
    </Dialog>
  </Stack>;
}
