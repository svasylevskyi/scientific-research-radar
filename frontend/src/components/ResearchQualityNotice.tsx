import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { QualityEvaluation, QualityFinding, QualitySnapshot } from "../api/researchQuality";
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

export function ResearchQualityNotice({ run, admin, evaluation, children }: {
  run: DigestRunDetail; admin: boolean; evaluation?: QualityEvaluation | null; children?: ReactNode;
}) {
  if (!admin) return null;
  const automaticStatus = run.quality_delivery_blocked ? "hold" : run.quality_status;
  const status = evaluation?.status ?? automaticStatus;
  const config = evaluation?.config ?? run.quality_config;
  const findings = evaluation?.findings ?? run.quality_findings;
  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
      <Typography component="h2" variant="h6">Research quality</Typography>
      <Chip size="small" variant="outlined" color={status === "pass" ? "success" : status === "hold" ? "warning" : status === "warning" ? "info" : "default"} label={labels[status]} />
    </Stack>
    <Typography color="text.secondary">
      Quality findings flag missing content, inconsistent references, and possible source or coverage limitations.
      These checks use saved research data, make no OpenAI requests, and assess consistency, not factual accuracy.
    </Typography>
    {run.quality_delivery_blocked && <Alert severity="warning">The original automatic decision held this output. Automatic email is blocked; manual evaluation does not release it.</Alert>}
    {!run.quality_delivery_blocked && automaticStatus === "hold" && <Alert severity="info">The original check recorded a Hold. Observation mode allows delivery.</Alert>}
    {children}
    <Typography variant="body2" color="text.secondary">
      {evaluation
        ? `Latest manual evaluation: ${runDate(evaluation.created_at).toLocaleString()} · ${evaluation.created_by_name}`
        : run.quality_evaluated_at
          ? `Automatic evaluation: ${runDate(run.quality_evaluated_at).toLocaleString()}`
          : run.status === "completed" ? "Automatic checks: not evaluated." : "Automatic checks run when research completes."}
    </Typography>
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Quality findings and settings · {labels[status]}</Typography></AccordionSummary>
      <AccordionDetails><QualityDetails config={config} findings={findings} status={status} /></AccordionDetails>
    </Accordion>
    {evaluation && <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Original automatic check · {labels[automaticStatus]}</Typography></AccordionSummary>
      <AccordionDetails>
        {run.quality_evaluated_at && <Typography variant="body2" sx={{ mb: 1 }}>{runDate(run.quality_evaluated_at).toLocaleString()}</Typography>}
        <QualityDetails config={run.quality_config} findings={run.quality_findings} status={automaticStatus} />
      </AccordionDetails>
    </Accordion>}
  </Stack>;
}
