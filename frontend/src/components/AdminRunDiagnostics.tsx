import { Box, CircularProgress, Link, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { DiagnosticTab } from "../navigationContext";
import type { DigestRunDetail } from "../types/digest";
import { AdminCostDetails, AdminCostSummary, useAdminRunCosts } from "./AdminRunCosts";
import { AdminDigestCostSummary } from "./AdminDigestCostSummary";
import { AdminRunQuality } from "./AdminRunQuality";
import { DigestRunProgress } from "./DigestRunProgress";

export const diagnosticTabs = [
  { value: "quality", label: "Research Quality" },
  { value: "costs", label: "Costs" },
  { value: "steps", label: "Steps" },
] as const;

export function AdminRunDiagnostics({ digestId, run, visible, tab, onTabChange, benchmarkPath }: {
  digestId: string; run: DigestRunDetail | null; visible: boolean;
  tab: DiagnosticTab; onTabChange: (tab: DiagnosticTab) => void; benchmarkPath: string;
}) {
  const costs = useAdminRunCosts(visible && tab === "costs", digestId, run);
  return <Box hidden={!visible} id="admin-run-diagnostics">
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      <Tabs value={tab} onChange={(_, value) => onTabChange(value)} variant="scrollable" scrollButtons="auto" aria-label="Run diagnostics">
        {diagnosticTabs.map(item => <Tab key={item.value} value={item.value} label={item.label}
          id={`diagnostic-tab-${item.value}`} aria-controls={`diagnostic-panel-${item.value}`} />)}
      </Tabs>
    </Paper>
    <Stack id="diagnostic-panel-quality" role="tabpanel" aria-labelledby="diagnostic-tab-quality" hidden={tab !== "quality"} sx={{ display: tab === "quality" ? "flex" : "none" }} spacing={3}>
      <Link component={RouterLink} to={benchmarkPath} sx={{ alignSelf: "flex-start" }}>
        Open human benchmark review
      </Link>
      {run ? <AdminRunQuality key={run.id} digestId={digestId} run={run} /> : <CircularProgress aria-label="Loading run quality" />}
    </Stack>
    {tab === "costs" && <Stack id="diagnostic-panel-costs" role="tabpanel" aria-labelledby="diagnostic-tab-costs" spacing={2}>
      <Typography component="h2" variant="h6">Costs</Typography>
      <AdminCostSummary {...costs} /><AdminCostDetails {...costs} />
      <AdminDigestCostSummary digestId={digestId} />
    </Stack>}
    {tab === "steps" && <Stack id="diagnostic-panel-steps" role="tabpanel" aria-labelledby="diagnostic-tab-steps" spacing={2}>
      <Typography component="h2" variant="h6">Run steps</Typography>
      {run ? <><DigestRunProgress run={run} /><Typography>
        OpenAI response jobs created: {run.request_count}. Paper-summary batches may create multiple jobs.
      </Typography></> : <CircularProgress aria-label="Loading run steps" />}
    </Stack>}
  </Box>;
}
