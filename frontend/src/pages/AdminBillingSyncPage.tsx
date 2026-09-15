import { Fragment, useCallback } from "react";
import {
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { AdminBillingNavigation } from "../components/AdminBillingNavigation";
import { usePollingResource } from "../hooks/usePollingResource";
import { AdminInvoiceReview } from "../components/AdminInvoiceReview";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";

type Job = import("../types/api.generated").components["schemas"]["BillingJobRead"];
type Status = import("../types/api-contracts").ApiResponse<"/api/v1/admin/billing-sync", "get">;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
const states = ["pending", "processing", "retry", "failed", "processed"];

type RetryReceipt = import("../types/api-contracts").ApiResponse<"/api/v1/admin/billing-sync/{job_id}/retry", "post">;

export function AdminBillingSyncPage() {
  const [params, setParams] = useSearchParams();
  const owner = params.get("user_id");
  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const load = useCallback(() => {
    const query = new URLSearchParams({ offset: String(offset), limit: "25" });
    if (state) query.set("state", state);
    if (owner) query.set("user_id", owner);
    return apiRequest<Status>(`/admin/billing-sync?${query}`);
  }, [owner, state, offset]);
  const resource = usePollingResource(load);
  const data = resource.data;
  const pollError = resource.error;
  async function retry(job: Job) {
    if (busy || pollError) return;
    setBusy(job.id);
    setError("");
    try {
      await apiRequest<RetryReceipt>(
        `/admin/billing-sync/${encodeURIComponent(job.id)}/retry`,
        { method: "POST" },
      );
      await resource.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not queue synchronization.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <AdminBillingNavigation
          current="sync"
          userId={owner}
          email={
            owner
              ? data?.items.find((job) => job.user_id === owner)?.email
              : null
          }
        />
        <Typography component="h1" variant="h3" gutterBottom>
          Billing synchronization
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          Sandbox only. Webhooks are saved before acknowledgment and processed
          in the background. Known subscriptions are checked periodically
          against Stripe. Verified invoice settlement controls research access
          for accounts opted into sandbox limits. Synchronization never resets
          usage allowances.
        </Alert>
        {(error || pollError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || pollError}
          </Alert>
        )}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mb: 2 }}
        >
          <TextField
            select
            label="Job status"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {states.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <Button onClick={() => void resource.refresh()}>Refresh</Button>
          {owner && (
            <Button
              onClick={() => {
                setParams({});
                setOffset(0);
              }}
            >
              Show all accessible users
            </Button>
          )}
        </Stack>
        {!data && !pollError && (
          <Typography role="status">Loading synchronization status…</Typography>
        )}
        {data && (
          <Stack spacing={2}>
            <Alert severity={data.worker_healthy ? "success" : "warning"}>
              Worker{" "}
              {data.worker_healthy
                ? "is checking the queue"
                : "has no recent heartbeat; check the API service"}
              . Last heartbeat: {date(data.worker_last_seen_at)}. A healthy
              worker can still have failed jobs below.
            </Alert>
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
              {states.map((value) => (
                <Chip
                  key={value}
                  label={`${value}: ${data.counts[value] ?? 0}`}
                  color={
                    value === "failed" && data.counts[value]
                      ? "error"
                      : "default"
                  }
                />
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Processed reconciliation jobs show their next periodic check.
              Processed webhooks are retained for duplicate detection. Failed
              jobs have exhausted automatic retries and need review. No provider
              calls are made by refreshing this page.
            </Typography>
            {!data.items.length && (
              <Typography>
                No matching synchronization jobs. New checkout attempts are
                discovered automatically.
              </Typography>
            )}
            <TableContainer component={Paper} variant="outlined">
              <Table
                size="small"
                aria-label="Billing synchronization jobs"
                sx={{
                  "@media (max-width: 599px)": {
                    "&, & tbody, & tr, & td": { display: "block" },
                    "& thead": { display: "none" },
                    "& td": { borderBottom: 0 },
                    "& tr": { borderBottom: 1, borderColor: "divider" },
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      "User / job",
                      "Status",
                      "Last activity / next check",
                      "Actions",
                    ].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((job) => {
                    const expired =
                      job.state === "processing" &&
                      !!job.lease_expires_at &&
                      new Date(job.lease_expires_at).getTime() <= Date.now();
                    const retryable =
                      ["failed", "retry"].includes(job.state) ||
                      expired ||
                      (job.kind === "reconcile" && job.state === "processed");
                    const open = expanded === job.id;
                    return (
                      <Fragment key={job.id}>
                        <TableRow sx={{ verticalAlign: "top" }}>
                          <TableCell sx={{ overflowWrap: "anywhere" }}>
                            <Button
                              component={Link}
                              to={`/admin/users/${job.user_id}`}
                              sx={{ textTransform: "none", p: 0 }}
                            >
                              {job.email}
                            </Button>
                            <Typography variant="body2">
                              {job.kind === "webhook"
                                ? job.event_type
                                : "Periodic reconciliation"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.5} alignItems="flex-start">
                              <Chip
                                size="small"
                                label={job.state}
                                color={
                                  job.state === "failed" ? "error" : "default"
                                }
                              />
                              {job.last_error && (
                                <Typography color="error" variant="caption">
                                  Error recorded — expand diagnostics
                                </Typography>
                              )}
                              {!job.price_matches && (
                                <Chip
                                  size="small"
                                  color="warning"
                                  label="Price mismatch"
                                />
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              Last attempt: {date(job.last_attempt_at)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Next:{" "}
                              {job.next_attempt_at
                                ? date(job.next_attempt_at)
                                : "None scheduled"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack alignItems="flex-start">
                              <Button
                                size="small"
                                aria-expanded={open}
                                aria-controls={`job-${job.id}`}
                                onClick={() =>
                                  setExpanded(open ? null : job.id)
                                }
                              >
                                {open ? "Hide diagnostics" : "Diagnostics"}
                              </Button>
                              <Button
                                size="small"
                                disabled={!!busy || !!pollError || !retryable}
                                onClick={() => void retry(job)}
                              >
                                {busy === job.id
                                  ? "Queuing…"
                                  : job.kind === "reconcile" &&
                                      job.state === "processed"
                                    ? "Reconcile now"
                                    : "Retry synchronization"}
                              </Button>
                              {!owner && (
                                <Button
                                  size="small"
                                  onClick={() => {
                                    setParams({ user_id: job.user_id });
                                    setOffset(0);
                                    setExpanded(null);
                                  }}
                                >
                                  Filter user
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ p: 0 }}>
                              <Collapse in={open} unmountOnExit>
                                <Stack
                                  id={`job-${job.id}`}
                                  spacing={1}
                                  sx={{
                                    p: 2,
                                    bgcolor: "action.hover",
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  <Typography variant="subtitle2">
                                    Diagnostics for {job.email}
                                  </Typography>
                                  <Typography variant="body2">
                                    Job: {job.id} · Checkout: {job.checkout_id}
                                  </Typography>
                                  {job.last_error && (
                                    <Alert
                                      severity={
                                        job.state === "failed"
                                          ? "error"
                                          : "warning"
                                      }
                                    >
                                      {job.last_error}
                                    </Alert>
                                  )}
                                  <Typography>
                                    Attempts: {job.attempts} · Consecutive
                                    failures: {job.failures} · Manual requests:{" "}
                                    {job.manual_retries}
                                  </Typography>
                                  <Typography>
                                    Last successful job:{" "}
                                    {date(job.last_success_at)} · Lease expiry:{" "}
                                    {date(job.lease_expires_at)}
                                  </Typography>
                                  <Typography>
                                    Subscription:{" "}
                                    {job.subscription_status ??
                                      "Not established"}{" "}
                                    · Last verified Stripe state:{" "}
                                    {date(job.provider_observed_at)}
                                  </Typography>
                                  {!job.price_matches && (
                                    <Alert severity="warning">
                                      The Stripe price no longer matches the
                                      saved plan revision.
                                    </Alert>
                                  )}
                                  {job.retried_at && (
                                    <Typography>
                                      Last manual request:{" "}
                                      {date(job.retried_at)} · Admin{" "}
                                      {job.retried_by ?? "deleted"}
                                    </Typography>
                                  )}
                                  <AdminInvoiceReview
                                    checkoutId={job.checkout_id}
                                  />
                                  <AdminBillingNavigation
                                    current="sync"
                                    userId={job.user_id}
                                    email={job.email}
                                  />
                                </Stack>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Stack direction="row" spacing={2}>
              <Button
                disabled={!offset}
                onClick={() => setOffset((value) => Math.max(0, value - 25))}
              >
                Previous
              </Button>
              <Typography sx={{ alignSelf: "center" }}>
                {data.total} matching jobs
              </Typography>
              <Button
                disabled={offset + 25 >= data.total}
                onClick={() => setOffset((value) => value + 25)}
              >
                Next
              </Button>
            </Stack>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
