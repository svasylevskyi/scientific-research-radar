import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Stack, Typography } from "@mui/material";
import type { QualityFinding, QualitySnapshot } from "../api/researchQuality";
import type { DigestRunDetail } from "../types/digest";
import { runDate } from "../runHistory";

const labels = { pass: "Pass", warning: "Warning", hold: "Hold", not_evaluated: "Not evaluated" };

export function QualityDetails({ config, findings, status }: {
  config: QualitySnapshot | null; findings: QualityFinding[]; status: keyof typeof labels;
}) {
  return <Stack spacing={1}>
    <Typography variant="body2">{config
      ? `Automatic mode: ${config.config.mode}. Settings version ${config.version}; checks version ${config.engine_version}.`
      : "Legacy run: no quality settings snapshot."}</Typography>
    {config && <Typography variant="body2" color="text.secondary">
      Dates: {config.config.check_reporting_dates ? "on" : "off"} · Duplicates: {config.config.check_duplicates ? "on" : "off"} · Source access: {config.config.check_source_access ? "on" : "off"} · Sparse warning below {config.config.sparse_paper_threshold} papers
    </Typography>}
    {!findings.length && <Typography variant="body2">{status === "not_evaluated" ? "No quality evaluation was performed." : "No findings."}</Typography>}
    {findings.map((finding, index) => <Box key={`${finding.code}-${index}`} sx={{ overflowWrap: "anywhere" }}>
      <Typography variant="body2" fontWeight={700}>{finding.severity === "hold" ? "Hold" : "Warning"}: {finding.message}</Typography>
      {!!finding.paper_ids?.length && <Typography variant="caption">Papers: {finding.paper_ids.join(", ")}</Typography>}
    </Box>)}
  </Stack>;
}

/** The saved delivery decision is independent of every later manual assessment. */
export function ResearchQualityNotice({ run, admin }: { run: DigestRunDetail; admin: boolean }) {
  if (!admin) return null;
  const status = run.quality_delivery_blocked ? "hold" : run.quality_status;
  const awaitingDecision = run.status !== "completed" || (run.quality_config?.config.mode === "enforce" && !run.quality_evaluated_at);
  const delivery = run.quality_delivery_blocked ? "Automatic email blocked" : awaitingDecision ? "No completed delivery decision" : "Not blocked by quality checks";
  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
      <Typography component="h3" variant="subtitle1" fontWeight={700}>Original delivery decision</Typography>
      <Chip size="small" variant="outlined" color={run.quality_delivery_blocked ? "warning" : "default"} label={delivery} />
    </Stack>
    <Typography variant="body2">This is the decision saved for the run. Later checks and AI reviews never change it, release a hold, send email, or consume subscriber research allowances. Delivery also depends on scheduling and email settings.</Typography>
    {!run.quality_delivery_blocked && status === "hold" && run.quality_config?.config.mode === "observe" && <Typography variant="body2">The original check recorded a Hold. Observation mode allows delivery.</Typography>}
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Original automatic findings · {labels[status]}</Typography></AccordionSummary>
      <AccordionDetails>
        {run.quality_evaluated_at && <Typography variant="body2" sx={{ mb: 1 }}>{runDate(run.quality_evaluated_at).toLocaleString()}</Typography>}
        <QualityDetails config={run.quality_config} findings={run.quality_findings} status={status} />
      </AccordionDetails>
    </Accordion>
  </Stack>;
}
