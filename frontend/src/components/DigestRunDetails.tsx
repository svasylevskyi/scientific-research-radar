import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { DigestRunDetail } from "../types/digest";

const audienceLabels: Record<string, string> = {
  researchers: "Researchers",
  builders_technical_teams: "Builders / technical teams",
  science_communicators_educators: "Science communicators / educators",
  executives_decision_makers: "Executives / decision makers",
  general: "General audience",
};
const notRecorded = "Not recorded";
function savedText(value: unknown, optional = false): string {
  if (optional && (value === null || value === "")) return "None";
  return typeof value === "string" && value.trim() ? value : notRecorded;
}
function savedList(value: unknown, audience = false): string {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim())) return notRecorded;
  return value.length ? value.map(item => audience ? audienceLabels[item] ?? item : item).join(", ") : "None";
}

/** Only allowlisted fields from this run's snapshot; never the live digest/defaults. */
export function DigestRunDetails({ run, settingsHref }: { run: DigestRunDetail; settingsHref: string }) {
  const raw = run.digest_snapshot;
  const snapshot = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rows = [
    ["Digest topic", savedText(snapshot.topic)],
    ["Digest description", savedText(snapshot.description, true)],
    ["Include keywords", savedList(snapshot.include_keywords)],
    ["Exclude keywords", savedList(snapshot.exclude_keywords)],
    ["Target audience", savedList(snapshot.target_audience, true)],
    // Date-only values stay as saved; converting to local timestamps can shift days.
    ["Reporting period from", savedText(snapshot.reporting_from)],
    ["Reporting period to", savedText(snapshot.reporting_to)],
    ["Maximum papers", typeof snapshot.maximum_papers === "number" && Number.isSafeInteger(snapshot.maximum_papers)
      && snapshot.maximum_papers >= 0 ? String(snapshot.maximum_papers) : notRecorded],
  ];
  if (typeof snapshot.frequency === "string" && snapshot.frequency) rows.push(["Legacy frequency (saved)", snapshot.frequency]);
  return (
    <Paper variant="outlined" component="section" aria-label="Digest details saved with this run"
      sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3, minWidth: 0, overflowWrap: "anywhere" }}>
      <Stack spacing={2}>
        <Typography component="h2" variant="h5">Digest details saved with this run</Typography>
        <Typography variant="body2" color="text.secondary">
          Read-only settings captured when this run was created. Editing the current digest does not change these settings or this run’s results.
        </Typography>
        {rows.every(([, value]) => value === notRecorded) && <Typography role="status">
          No saved digest settings are available for this run. Current settings have not been substituted.
        </Typography>}
        <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
          {rows.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}>
            <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: "pre-wrap" }}>{value}</Typography>
          </Box>)}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Missing fields are marked Not recorded. These reporting dates belong to the selected run; the current schedule is managed separately in Radar controls.
        </Typography>
        <Box><Button component={Link} to={settingsHref} state={{ focusDigestSettingsFor: run.digest_id }} variant="outlined">
          Edit current digest details
        </Button></Box>
      </Stack>
    </Paper>
  );
}
