import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { DigestRunDetail } from "../types/digest";
import { runOverview } from "../resultPresentation";

export function SelectedRunOverview({ run, older = false, admin = false }: {
  run: DigestRunDetail; older?: boolean; admin?: boolean;
}) {
  const overview = runOverview(run);
  return (
    <Paper variant="outlined" component="section" aria-label="Selected run overview"
      sx={{ p: 2, mb: 2, minWidth: 0, overflowWrap: "anywhere" }}>
      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Typography component="h2" variant="subtitle1" fontWeight={750}>Selected run</Typography>
        <Chip size="small" variant="outlined" label={overview.status}
          color={run.status === "failed" ? "error" : run.status === "completed" ? "default" : "info"} />
        {older && <Chip size="small" label="Earlier run" variant="outlined" />}
        <Typography variant="body2" color="text.secondary">Started {overview.started} (local time)</Typography>
      </Stack>
      <Typography variant="body2" sx={{ mb: 1 }}>{overview.topic}</Typography>
      <Box component="dl" sx={{ display: "flex", flexWrap: "wrap", gap: 2, m: 0 }}>
        <Box><Typography component="dt" variant="caption" color="text.secondary">Reporting period saved with this run</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{overview.period}</Typography></Box>
        <Box><Typography component="dt" variant="caption" color="text.secondary">Papers recorded</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{overview.paperCount}</Typography></Box>
        <Box><Typography component="dt" variant="caption" color="text.secondary">Summaries available</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0 }}>{overview.summaryCount}</Typography></Box>
      </Box>
      {run.status === "completed" && !run.quality_delivery_blocked ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{overview.notice}</Typography>
      ) : (
        <Alert severity={run.quality_delivery_blocked || run.status === "failed" ? "warning" : "info"} sx={{ mt: 1 }}>
          {admin ? overview.notice.replace("Run Steps", "Run Diagnostics") : overview.notice}
        </Alert>
      )}
    </Paper>
  );
}
