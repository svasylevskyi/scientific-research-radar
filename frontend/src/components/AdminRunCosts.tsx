import { Accordion, AccordionDetails, AccordionSummary, Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { DigestRunDetail } from "../types/digest";

type Usage = { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_tokens: number };
type RequestCost = {
  id: string; response_id: string | null; model: string; reasoning_effort: string;
  status: string; outcome: string; usage: Usage | null; web_search_calls: number | null;
  estimated_usd: string | null; pricing: { version: string } | null;
  created_at: string; observed_at: string | null;
};
type Costs = { run_id: string; known_estimated_usd: string; complete: boolean; unknown_requests: number;
  historical_gap: boolean; request_count: number;
  stages: { stage: string; requests: RequestCost[]; legacy_accepted_usage: Usage | null }[] };
const money = (value: string | null) => value === null ? "Unknown" : `$${Number(value).toFixed(6)}`;
const stageName = (value: string) => value.replaceAll("_", " ");

export function useAdminRunCosts(admin: boolean, digestId: string, run: DigestRunDetail | null) {
  const [data, setData] = useState<Costs | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!admin || !run) return;
    let active = true;
    setError(false);
    apiRequest<Costs>(`/admin/digests/${digestId}/runs/${run.id}/costs`)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [admin, digestId, run]);
  return { data: data?.run_id === run?.id ? data : null, error };
}

export function AdminCostSummary({ data, error }: ReturnType<typeof useAdminRunCosts>) {
  if (error) return <Alert severity="warning">Cost details could not be loaded. Reload to retry.</Alert>;
  if (!data) return <Typography role="status">Loading cost details…</Typography>;
  return <Alert severity={data.complete ? "info" : "warning"}>
    {data.complete ? "Estimated run cost" : "Known cost subtotal"}: {money(data.known_estimated_usd)} USD.
    {" "}{data.request_count} recorded request attempts. {data.unknown_requests} with unknown cost.
    {!data.complete && " Total cost is incomplete."}
    {data.historical_gap && " Earlier requests have incomplete accounting."}
    {" "}Estimates are not an OpenAI invoice.
  </Alert>;
}

export function AdminCostDetails({ data, error }: ReturnType<typeof useAdminRunCosts>) {
  if (error || !data) return <AdminCostSummary data={data} error={error} />;
  return <Stack spacing={2}>
    <Typography color="text.secondary">Usage includes rejected responses and retries recorded since accounting was enabled. Polling an existing response does not add another request. Cached input is part of input; reasoning is part of output and is not charged twice. Expand a stage for request details.</Typography>
    {data.stages.map((stage) => <Accordion key={stage.stage}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ textTransform: "capitalize" }}>{stageName(stage.stage)} · {stage.requests.length} requests · known subtotal {money(String(stage.requests.reduce((sum, row) => sum + Number(row.estimated_usd ?? 0), 0)))}</Typography></AccordionSummary>
      <AccordionDetails>
        {!stage.requests.length && <Typography color="text.secondary">No request ledger is available for this stage.{stage.legacy_accepted_usage && ` Legacy accepted-output usage: ${stage.legacy_accepted_usage.input_tokens ?? 0} input and ${stage.legacy_accepted_usage.output_tokens ?? 0} output tokens. Retry and rejected-response usage may be missing.`}</Typography>}
        <TableContainer><Table size="small" aria-label={`${stageName(stage.stage)} usage`}>
          <TableHead><TableRow>{["Request / model", "Outcome", "Input (cached)", "Output (reasoning)", "Search calls", "Estimated USD"].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{stage.requests.map((row) => <TableRow key={row.id}>
            <TableCell sx={{ overflowWrap: "anywhere", minWidth: 150 }}>{row.response_id ?? "Response ID unavailable"}<Typography variant="body2">{row.model} · {row.reasoning_effort}</Typography><Typography variant="caption">{new Date(row.created_at).toLocaleString()}<br />Pricing: {row.pricing?.version ?? "Unconfigured"}</Typography></TableCell>
            <TableCell>{row.status}<br />{row.outcome}</TableCell>
            <TableCell>{row.usage ? `${row.usage.input_tokens} (${row.usage.cached_input_tokens})` : "Unknown"}</TableCell>
            <TableCell>{row.usage ? `${row.usage.output_tokens} (${row.usage.reasoning_tokens})` : "Unknown"}</TableCell>
            <TableCell>{row.web_search_calls ?? "Unknown"}</TableCell>
            <TableCell>{money(row.estimated_usd)}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
      </AccordionDetails>
    </Accordion>)}
    <Typography variant="body2" color="text.secondary">Pricing is snapshotted per request from database-managed pricing. Unknown pricing, unsupported tariffs, and missing provider usage are excluded from known subtotals. Older runs are not retroactively assigned prices.</Typography>
  </Stack>;
}
