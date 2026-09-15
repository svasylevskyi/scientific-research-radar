import { AdminBillingNavigation } from "../components/AdminBillingNavigation";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { ApiError } from "../api/client";
import { subscriptionsApi } from "../api/subscriptions";
import { usePollingResource } from "../hooks/usePollingResource";
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "Not available";

export function AdminSubscriptionAccessPage() {
  const [params] = useSearchParams();
  return <AccessEditor key={params.get("user_id") ?? "none"} />;
}
function AccessEditor() {
  const [params] = useSearchParams();
  const userId = params.get("user_id");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("complimentary");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmedVersion, setConfirmedVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const load = useCallback(
    () =>
      userId
        ? subscriptionsApi.adminAccess(userId, offset)
        : Promise.resolve(null),
    [userId, offset],
  );
  const resource = usePollingResource(load);
  const data = resource.data;
  async function save() {
    if (!data || !userId || busy || resource.error) return;
    setBusy(true);
    setError("");
    try {
      await subscriptionsApi.saveAccessPolicy(userId, {
        mode,
        expected_version: confirmedVersion,
        change_note: note,
      });
      setConfirm(false);
      setNote("");
      setOffset(0);
      void resource.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not change access policy.",
      );
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: 4 }}>
        <AdminBillingNavigation current="access" userId={userId} email={data?.email} />
        <Typography component="h1" variant="h3" gutterBottom>
          Subscription access
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Choose enforced subscription limits (Free or the verified paid
          subscription), or complimentary development access. Observation
          assignments remain separate. Switching modes preserves previously
          counted usage.
        </Alert>
        {!userId && (
          <Button component={Link} to="/admin/users">
            Choose a user in user administration
          </Button>
        )}
        {(error || resource.error) && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button
                onClick={() => {
                  setError("");
                  void resource.refresh();
                }}
              >
                Retry
              </Button>
            }
          >
            {error || resource.error}
          </Alert>
        )}
        {!data && !error && !resource.error && userId && (
          <Typography role="status">Loading subscription…</Typography>
        )}
        {data && (
          <Stack spacing={2}>
            {data.email && <Typography>{data.email}</Typography>}
            <Alert
              severity={
                data.allowed
                  ? data.grace_until
                    ? "warning"
                    : "info"
                  : "warning"
              }
            >
              {data.reason}
            </Alert>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6">
                {data.plan?.name ??
                  (data.mode === "complimentary"
                    ? "Complimentary development access"
                    : "Subscription not verified")}
              </Typography>
              <Typography>
                Access mode:{" "}
                {data.mode === "sandbox"
                  ? "Subscription limits enforced"
                  : "Complimentary"}
              </Typography>
              {data.mode === "sandbox" && (
                <>
                  <Typography>Status: {data.status}</Typography>
                  {data.billing_type !== "free" && (
                    <Typography>
                      Invoice status: {data.payment_status ?? "Not verified"} ·
                      Settled coverage through:{" "}
                      {date(data.paid_through ?? null)}
                    </Typography>
                  )}
                  {data.billing_type !== "free" && (
                    <Typography>
                      Last verified: {date(data.observed_at)}
                    </Typography>
                  )}
                  <Typography>
                    Allowance window: {date(data.period_start)} –{" "}
                    {date(data.period_end)}
                  </Typography>
                  {data.billing_type !== "free" && (
                    <Typography>
                      Verified access until: {date(data.access_until)}
                    </Typography>
                  )}
                  {data.cancel_at_period_end &&
                    data.billing_type !== "free" && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        Cancellation is scheduled. Paid access continues through
                        the verified period, then Free applies automatically.
                        Your saved research is retained.
                      </Alert>
                    )}
                </>
              )}
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6">Available allowances</Typography>
              {Object.entries(data.remaining).map(([key, value]) => (
                <Typography key={key}>
                  {key.replaceAll("_", " ")}:{" "}
                  {value ??
                    (data.mode === "complimentary"
                      ? "No subscription limit"
                      : "Not available")}
                </Typography>
              ))}
              <Typography sx={{ mt: 1 }}>
                Completed runs: {data.usage.completed_runs} · Reserved runs:{" "}
                {data.usage.reserved_runs}
              </Typography>
              <Typography>
                Completed papers: {data.usage.completed_papers} · Reserved
                papers: {data.usage.reserved_papers}
              </Typography>
              {data.plan && (
                <Typography>
                  Up to {data.plan.configuration.max_papers_per_run} papers per
                  run. Schedules:{" "}
                  {data.plan.configuration.schedule_frequencies.join(", ") ||
                    "not included"}
                  . Email delivery:{" "}
                  {data.plan.configuration.email_delivery
                    ? "included"
                    : "not included"}
                  .
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Allowances reset on the account’s monthly anniversary, including
                annual plans. Cancellation, Free fallback, and payment recovery
                preserve the allowance clock and usage. Queued work reserves
                capacity. Successful runs count actual summarized papers; failed
                runs release their reservation. Retrying checks the current
                window again. Usage shown here starts when subscription limits are
                enabled; earlier observation usage remains separate.
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6">Change access mode</Typography>
                <TextField
                  select
                  label="New access mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <MenuItem value="complimentary">
                    Complimentary development access
                  </MenuItem>
                  <MenuItem value="sandbox">
                    Enforce subscription limits
                  </MenuItem>
                </TextField>
                <TextField
                  label="Reason for change"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  inputProps={{ maxLength: 500 }}
                />
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    !!resource.error ||
                    !note.trim() ||
                    mode === data.mode
                  }
                  onClick={() => {
                    setConfirmedVersion(data.version);
                    setConfirm(true);
                  }}
                >
                  Review change
                </Button>
                <Typography variant="h6">Access policy history</Typography>
                {!data.history?.length && (
                  <Typography>No policy changes recorded.</Typography>
                )}
                {data.history?.map((row) => (
                  <Typography key={row.version}>
                    Revision {row.version} · {row.mode === "sandbox" ? "Subscription limits" : "Complimentary"} · {date(row.created_at)}{" "}
                    — {row.change_note}
                  </Typography>
                ))}
                <Stack direction="row">
                  <Button
                    disabled={!offset}
                    onClick={() => setOffset((x) => Math.max(0, x - 25))}
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={(data.history?.length ?? 0) < 25}
                    onClick={() => setOffset((x) => x + 25)}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        )}
        <Dialog
          open={confirm}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <DialogTitle>Change research access?</DialogTitle>
          <DialogContent>
            {mode === "sandbox"
              ? "This account will use its assigned Free tier or verified paid subscription, with limits enforced for new digests and research. Saved results remain accessible."
              : "This restores complimentary development research access. Existing usage records will be retained."}
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !!resource.error}
              onClick={() => void save()}
            >
              Confirm change
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
