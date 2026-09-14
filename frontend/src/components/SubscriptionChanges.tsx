import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError } from "../api/client";
import { subscriptionsApi } from "../api/subscriptions";
import { useSubscription } from "./SubscriptionData";
import type { ChangeOption as Option } from "../types/subscription";

const money = (o: { price: string; currency: string }) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: o.currency,
  }).format(Number(o.price));
const label = (o: Option) =>
  `${o.name} · ${money(o)} / ${o.interval === "annual" ? "year" : "month"}`;
const key = (o: Option) => `${o.code}:${o.revision}:${o.interval}`;

export function SubscriptionChanges() {
  const { changes: data, busy, perform } = useSubscription();
  const [selection, setSelection] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"schedule" | "undo" | null>(null);
  const selected = data?.items.find((o) => key(o) === selection);
  function choose(value: string) {
    setSelection(value);
    const option = data?.items.find((o) => key(o) === value);
    setIds(
      data?.digests.slice(0, option?.max_digests ?? 0).map((d) => d.id) ?? [],
    );
  }
  function toggle(current: string[], id: string) {
    return current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
  }
  async function action(name: "schedule" | "undo" | "retry") {
    if (busy || !data) return;
    setError("");
    try {
      if (name === "schedule" && selected) {
        await perform(() =>
          subscriptionsApi.schedule({
            code: selected.code,
            revision: selected.revision,
            interval: selected.interval,
            expected_period_end: data.effective_at,
            digest_ids: ids,
          }),
        );
      } else if (data.change && name !== "schedule") {
        await perform(() =>
          subscriptionsApi.changeAction(data.change!.id, name),
        );
      }
      setConfirm(null);
      setSelection("");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "The change could not be confirmed. Refresh or retry the saved request.",
      );
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Changes at renewal</Typography>
        <Typography>
          Downgrades and monthly/yearly switches start at your next renewal.
          There is no immediate charge or proration. Your monthly allowance
          reset date and used allowance stay the same.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {data?.change && (
          <Alert severity={data.change.error ? "warning" : "info"}>
            {data.change.plan_name} · {money(data.change)} /{" "}
            {data.change.interval === "annual" ? "year" : "month"} ·{" "}
            {new Date(data.change.effective_at).toLocaleString()}
            <Typography variant="body2">
              Status: {data.change.state.replaceAll("_", " ")}
            </Typography>
            {data.change.error && (
              <Typography variant="body2">{data.change.error}</Typography>
            )}
            {data.change.undo_allowed && (
              <Button disabled={busy} onClick={() => setConfirm("undo")}>
                Undo scheduled change
              </Button>
            )}
            {data.change.retry_allowed && (
              <Button disabled={busy} onClick={() => void action("retry")}>
                Retry saved request
              </Button>
            )}
            {data.change.state === "awaiting_payment" && (
              <Typography>
                Payment verification is pending. Use Manage billing to update
                your payment method if needed.
              </Typography>
            )}
          </Alert>
        )}
        {data?.reason && <Typography variant="body2">{data.reason}</Typography>}
        {!!data?.items.length && (
          <>
            <TextField
              select
              fullWidth
              label="Plan and billing interval at next renewal"
              value={selection}
              disabled={busy}
              onChange={(e) => choose(e.target.value)}
            >
              <MenuItem value="">Choose a change</MenuItem>
              {data.items.map((o) => (
                <MenuItem key={key(o)} value={key(o)}>
                  {label(o)}
                </MenuItem>
              ))}
            </TextField>
            {selected && (
              <>
                <Typography>
                  {selected.max_digests} active digests ·{" "}
                  {selected.runs_per_month} runs/month ·{" "}
                  {selected.manual_runs_per_month} manual runs/month ·{" "}
                  {selected.papers_per_month} papers/month ·{" "}
                  {selected.max_papers_per_run} papers/run.
                </Typography>
                <Typography variant="body2">
                  Schedules:{" "}
                  {selected.schedule_frequencies.join(", ") || "none"}. Email
                  delivery:{" "}
                  {selected.email_delivery ? "included" : "not included"}.
                  Excess digests and all saved research are retained.
                  Incompatible schedules pause and require explicit resumption.
                </Typography>
                {data.digests.length > selected.max_digests && (
                  <Stack>
                    <Typography>
                      Choose {selected.max_digests} digests to keep active:
                    </Typography>
                    {data.digests.map((d) => (
                      <FormControlLabel
                        key={d.id}
                        control={
                          <Checkbox
                            checked={ids.includes(d.id)}
                            disabled={
                              busy ||
                              (!ids.includes(d.id) &&
                                ids.length >= selected.max_digests)
                            }
                            onChange={() => setIds(toggle(ids, d.id))}
                          />
                        }
                        label={d.topic}
                      />
                    ))}
                  </Stack>
                )}
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    ids.length !==
                      Math.min(selected.max_digests, data.digests.length)
                  }
                  onClick={() => setConfirm("schedule")}
                >
                  Review change
                </Button>
              </>
            )}
          </>
        )}
        <Dialog
          open={confirm !== null}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <DialogTitle>
            {confirm === "undo"
              ? "Undo the scheduled change?"
              : "Confirm change at renewal"}
          </DialogTitle>
          <DialogContent>
            {confirm === "undo"
              ? "Your current plan and billing interval will continue. Undo is unavailable during the final 30 seconds before renewal while the change starts."
              : selected && (
                  <>
                    <Typography>
                      {label(selected)} starting{" "}
                      {data?.effective_at
                        ? new Date(data.effective_at).toLocaleString()
                        : "at renewal"}
                      .
                    </Typography>
                    <Typography>
                      Your subscription will renew at this recurring price. No
                      charge is made now. Used quota stays counted; lower limits
                      can leave zero allowance until your next monthly reset.
                      Saved research is retained.
                    </Typography>
                  </>
                )}
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button
              disabled={busy || (confirm === "schedule" && !selected)}
              onClick={() =>
                void action(confirm === "undo" ? "undo" : "schedule")
              }
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Paper>
  );
}
