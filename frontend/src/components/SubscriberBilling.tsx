import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { subscriptionsApi } from "../api/subscriptions";
import { useSubscription } from "./SubscriptionData";
export function SubscriberBilling() {
  const [params] = useSearchParams();
  const { billing: data, busy, perform } = useSubscription();
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  async function action(name: "refresh" | "portal" | "resume" | "cancel") {
    if (busy) return;
    setError("");
    try {
      if (name === "refresh") await perform(subscriptionsApi.refreshBilling);
      else {
        const { url } = await perform(() => subscriptionsApi.openBilling(name));
        window.location.assign(url);
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not open billing. Try again.",
      );
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Billing and invoices</Typography>
        <Typography>
          Open Manage billing to view invoices and update payment details.
        </Typography>
        <Alert severity="info">
          Sandbox testing only. Use Stripe test payment details; no real payment
          is collected.
        </Alert>
        {params.has("stripe_return") && (
          <Alert severity="info">
            You have returned from Stripe. Your access updates after payment
            verification. Returning here does not confirm payment. You can
            refresh billing status below.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && (
          <Typography role="status">Loading billing…</Typography>
        )}
        {data && (
          <>
            {data.attempt && (
              <Typography>
                {data.attempt.plan_name} · {data.attempt.interval} ·{" "}
                {data.attempt.subscription_status ??
                  data.attempt.checkout_status}
              </Typography>
            )}
            {data.reason && <Typography>{data.reason}</Typography>}
            {data.cancel_at_period_end && (
              <Alert severity="info">
                Renewal is cancelled. Free will apply after paid access ends
                {data.period_end
                  ? ` on ${new Date(data.period_end).toLocaleString()}`
                  : ""}
                . To keep your subscription, review the cancellation in Manage
                billing before it takes effect.
              </Alert>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {data.cancel_allowed && (
                <Button
                  disabled={busy || !!error}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel at renewal
                </Button>
              )}
              <Button component={Link} to="/plans">
                Compare plans
              </Button>
              {data.resume_allowed && (
                <Button
                  disabled={busy || !!error}
                  onClick={() => void action("resume")}
                >
                  Resume checkout
                </Button>
              )}
              <Button
                disabled={busy || !data.portal_allowed || !!error}
                onClick={() => void action("portal")}
              >
                Manage billing
              </Button>
              <Button disabled={busy} onClick={() => void action("refresh")}>
                {busy ? "Please wait…" : "Refresh billing status"}
              </Button>
            </Stack>
            {!data.portal_allowed && (
              <Typography variant="body2">
                Billing management becomes available after a customer is
                established and the billing portal is configured.
              </Typography>
            )}
          </>
        )}
        <Dialog
          open={confirmCancel}
          onClose={() => {
            if (!busy) setConfirmCancel(false);
          }}
        >
          <DialogTitle>Cancel renewal and move to Free?</DialogTitle>
          <DialogContent>
            Paid benefits continue until the paid period ends. Your chosen Free
            digests stay active; all saved research is retained. Unsupported
            schedules pause. You will confirm cancellation on Stripe’s next
            screen.
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setConfirmCancel(false)}>
              Keep subscription
            </Button>
            <Button disabled={busy} onClick={() => void action("cancel")}>
              Continue to Stripe
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Paper>
  );
}
