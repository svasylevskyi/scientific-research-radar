import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Pagination, Stack, Typography } from "@mui/material";
import { useCallback, useRef, useState } from "react";
import { researchQualityApi, type QualityEvaluation } from "../api/researchQuality";
import { usePollingResource } from "../hooks/usePollingResource";
import type { DigestRunDetail } from "../types/digest";
import { QualityDetails, ResearchQualityNotice } from "./ResearchQualityNotice";
import { AdminSourceVerification } from "./AdminSourceVerification";
import { AdminSourceContent } from "./AdminSourceContent";

export function AdminRunQuality({ digestId, run }: { digestId: string; run: DigestRunDetail }) {
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<QualityEvaluation | null>(null);
  const load = useCallback(async () => {
    const [settings, history, first] = await Promise.all([
      researchQualityApi.get(),
      researchQualityApi.evaluations(digestId, run.id, page),
      page === 1 ? Promise.resolve(null) : researchQualityApi.evaluations(digestId, run.id, 1, 1),
    ]);
    return { settings, history, latest: (first ?? history).items[0] ?? null };
  }, [digestId, run.id, page]);
  const resource = usePollingResource(load, 30000);
  const data = resource.data;
  const latest = saved && (!data?.latest || new Date(saved.created_at) > new Date(data.latest.created_at)) ? saved : data?.latest;
  const canEvaluate = run.status === "completed" && !!data && !resource.error && !resource.loading;

  async function evaluate() {
    if (!canEvaluate || !data || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const evaluation = await researchQualityApi.evaluate(digestId, run.id, data.settings.version);
      setSaved(evaluation);
      setPage(1);
      await resource.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Quality evaluation failed. Please retry.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <Stack spacing={2}>
    <ResearchQualityNotice run={run} admin evaluation={latest}>
      <Typography variant="body2" color="text.secondary">
        Manual checks use the current rules{data ? ` (settings version ${data.settings.version})` : ""}, even when automatic checks are Off.
        They record a separate result without changing email delivery or research allowances.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button variant="outlined" disabled={!canEvaluate || saving} onClick={() => void evaluate()}>
          {saving ? "Evaluating…" : latest || run.quality_evaluated_at ? "Re-evaluate quality" : "Evaluate quality"}
        </Button>
        <Button disabled={saving || resource.loading} onClick={() => void resource.refresh()}>Refresh quality</Button>
      </Stack>
      {run.status !== "completed" && <Typography variant="body2">Manual evaluation is available for completed research runs.</Typography>}
      {resource.loading && <Typography role="status">Loading quality settings and history…</Typography>}
      {(error || resource.error) && <Alert severity="error">{error || resource.error}</Alert>}
      {saved && <Alert severity="success">Manual evaluation saved.</Alert>}
    </ResearchQualityNotice>
    <AdminSourceVerification key={run.id} digestId={digestId} run={run} />
    <AdminSourceContent key={`content-${run.id}`} digestId={digestId} runId={run.id} />
    {!!data?.history.total && <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Manual evaluation history · {data.history.total}</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        {data.history.items.map((evaluation) => <Box key={evaluation.id} sx={{ overflowWrap: "anywhere" }}>
          <Typography fontWeight={700} sx={{ textTransform: "capitalize" }}>{evaluation.status} · {new Date(evaluation.created_at).toLocaleString()}</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>{evaluation.created_by_name}</Typography>
          <QualityDetails config={evaluation.config} findings={evaluation.findings} status={evaluation.status} />
        </Box>)}
        {data.history.total > 20 && <Pagination count={Math.ceil(data.history.total / 20)} page={page} disabled={saving} onChange={(_, value) => setPage(value)} aria-label="Quality evaluation history pages" />}
      </Stack></AccordionDetails>
    </Accordion>}
  </Stack>;
}
