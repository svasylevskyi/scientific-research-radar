import { Alert, Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

type DigestCosts = { digest_id: string; run_count: number; known_estimated_usd: string;
  complete: boolean; unknown_requests: number; incomplete_runs: number };

export function AdminDigestCostSummary({ digestId }: { digestId: string }) {
  const [data, setData] = useState<DigestCosts | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await apiRequest<DigestCosts>(`/admin/digests/${digestId}/costs`);
        if (active) { setData(result); setError(false); }
      } catch { if (active) setError(true); }
      finally { if (active) timer = setTimeout(() => void refresh(), 15000); }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [digestId]);
  return <Box sx={{ mb: 3 }}>
    {error ? <Alert severity="warning">Digest cost total could not be refreshed. Retrying automatically.</Alert>
      : !data ? <Typography role="status">Loading digest cost total…</Typography>
      : <Alert severity={data.complete ? "info" : "warning"}>
        {data.complete ? "Estimated total cost of all runs" : "Known cost subtotal across all runs"}: ${Number(data.known_estimated_usd).toFixed(6)} USD.
        {" "}{data.run_count} runs, including failed runs and recorded retries.
        {!data.complete && ` Total is incomplete: ${data.incomplete_runs} runs have active or incomplete accounting; ${data.unknown_requests} recorded requests have unknown cost.`}
        {" "}Uses saved request pricing. Estimates are not an OpenAI invoice.
      </Alert>}
  </Box>;
}
