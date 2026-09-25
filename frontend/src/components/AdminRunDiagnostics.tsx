import { Box, CircularProgress, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { DigestRunDetail } from "../types/digest";
import { AdminCostDetails, AdminCostSummary, useAdminRunCosts } from "./AdminRunCosts";
import { AdminDigestCostSummary } from "./AdminDigestCostSummary";
import { AdminRunQuality } from "./AdminRunQuality";
import { BenchmarkReviewPanel } from "./BenchmarkReviewPanel";
import { DigestRunProgress } from "./DigestRunProgress";

export const diagnosticTabs = [
  { value: "quality", label: "Research Quality" },
  { value: "costs", label: "Costs" },
  { value: "steps", label: "Steps" },
] as const;

export function AdminRunDiagnostics({ digestId, selectedId, run, visible }: {
  digestId: string; selectedId: string; run: DigestRunDetail | null; visible: boolean;
}) {
  const [tab, setTab] = useState("quality");
  useEffect(() => setTab("quality"), [selectedId]);
  const costs = useAdminRunCosts(visible && tab === "costs", digestId, run);
  return <Box hidden={!visible} id="admin-run-diagnostics">
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Run diagnostics">
        {diagnosticTabs.map(item => <Tab key={item.value} value={item.value} label={item.label}
          id={`diagnostic-tab-${item.value}`} aria-controls={`diagnostic-panel-${item.value}`} />)}
      </Tabs>
    </Paper>
    <Stack id="diagnostic-panel-quality" role="tabpanel" aria-labelledby="diagnostic-tab-quality" hidden={tab !== "quality"} sx={{ display: tab === "quality" ? "flex" : "none" }} spacing={3}>
      {run ? <AdminRunQuality key={run.id} digestId={digestId} run={run} /> : <CircularProgress aria-label="Loading run quality" />}
      <BenchmarkReviewPanel />
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
