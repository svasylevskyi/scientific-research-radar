import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { DigestRunDetail } from "../types/digest";

export function ResearchQualityNotice({ run, admin }: { run: DigestRunDetail; admin: boolean }) {
  if (run.status !== "completed") return null;
  const status = run.quality_delivery_blocked ? "hold" : run.quality_status;
  const mode = run.quality_config?.config.mode;
  const findings = run.quality_findings;
  const description = run.quality_delivery_blocked
    ? "Output held — not approved for delivery. Automatic email is blocked."
    : status === "hold" ? "Quality checks flagged issues. Observation mode allows delivery."
    : status === "warning" ? "Quality checks found limitations."
    : status === "pass" ? "Quality checks passed" : "Quality: not evaluated";
  return <Box sx={{ mb: 2 }}>
    {status === "hold" || status === "warning" ? <Alert severity={status === "hold" ? "warning" : "info"}>
      <Typography fontWeight={700}>{description}</Typography>
      <Typography variant="body2">{findings[0]?.message}{findings.length > 1 ? ` ${findings.length - 1} more findings recorded.` : ""}</Typography>
    </Alert> : <Tooltip title="These deterministic checks do not verify scientific claims. Consult the original sources.">
      <Chip size="small" variant="outlined" color={status === "pass" ? "success" : "default"} label={description} />
    </Tooltip>}
    {admin && <Accordion disableGutters elevation={0} sx={{ bgcolor: "transparent" }}>
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>Quality findings and settings</AccordionSummary>
      <AccordionDetails><Stack spacing={1}>
        <Typography variant="body2">{run.quality_config ? `Mode: ${mode}. Settings version ${run.quality_config.version}; checks version ${run.quality_config.engine_version}.` : "Legacy run: no quality settings snapshot."}</Typography>
        <Typography variant="body2" color="text.secondary">Checks assess consistency, not factual accuracy. Off/Observe/Enforce changes apply only to new runs.</Typography>
        {!findings.length && <Typography variant="body2">{status === "not_evaluated" ? "No quality evaluation was performed." : "No findings."}</Typography>}
        {findings.map((finding, index) => <Box key={`${finding.code}-${index}`} sx={{ overflowWrap: "anywhere" }}>
          <Typography variant="body2" fontWeight={700}>{finding.severity === "hold" ? "Hold" : "Warning"}: {finding.message}</Typography>
          {!!finding.paper_ids?.length && <Typography variant="caption">Papers: {finding.paper_ids.join(", ")}</Typography>}
        </Box>)}
      </Stack></AccordionDetails>
    </Accordion>}
  </Box>;
}
