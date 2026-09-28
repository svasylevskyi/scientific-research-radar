import { ResourceNotice } from "./ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { Alert, Box, Typography } from "@mui/material";
import { useCallback } from "react";
import { apiRequest } from "../api/client";

type DigestCosts = { digest_id: string; run_count: number; known_estimated_usd: string;
  complete: boolean; unknown_requests: number; incomplete_runs: number };

export function AdminDigestCostSummary({ digestId }: { digestId: string }) {
  const load = useCallback((signal: AbortSignal) => apiRequest<DigestCosts>(`/admin/digests/${digestId}/costs`, { signal }), [digestId]);
  const resource = usePollingResource(load, 15000);
  const data = resource.data;
  return <Box sx={{ mb: 3 }}>
    <ResourceNotice {...resource} />
    {resource.loading && <Typography role="status">Loading digest cost total…</Typography>}
    {data && <Alert severity={data.complete ? "info" : "warning"}>
        {data.complete ? "Estimated total cost of all runs" : "Known cost subtotal across all runs"}: ${Number(data.known_estimated_usd).toFixed(6)} USD.
        {" "}{data.run_count} runs, including failed runs and recorded retries.
        {!data.complete && ` Total is incomplete: ${data.incomplete_runs} runs have active or incomplete accounting; ${data.unknown_requests} recorded requests have unknown cost.`}
        {" "}Uses saved request pricing. Estimates are not an OpenAI invoice.
      </Alert>}
  </Box>;
}
