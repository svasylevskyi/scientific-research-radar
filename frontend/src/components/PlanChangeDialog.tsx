import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from "@mui/material";
import { ApiError } from "../api/client";
import { subscriptionsApi } from "../api/subscriptions";
import { canCancelPlanChange, hasPendingPlanChange, choiceLabel, choiceStillAvailable, planOrigin, selectionIdsValid, type PlanAccount, type PlanChoice } from "../planChoices";
import type { Change, Upgrade } from "../types/subscription";

export type PerformPlanAction = <T>(action: () => Promise<T>) => Promise<T>;
type Review = { kind: "choice"; choice: PlanChoice; quote: Upgrade | null }
  | { kind: "quote"; quote: Upgrade; origin: string }
  | { kind: "undo"; change: Change; origin: string };
const money = (value: number, currency: string) => new Intl.NumberFormat(undefined,
  { style: "currency", currency: currency.toUpperCase() }).format(value);
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not available";
// Billing responses are JSON. Keep reviewed terms independent of subsequent observations.
const freezeReview = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const intervalName = (value: string) => value === "annual" ? "year" : "month";
const upgradeStates: Record<string, string> = {
  preview: "Ready to review", submitting: "Confirming upgrade with Stripe", pending_payment: "Payment or authentication required",
  applied: "Upgrade active", expired: "Preview or pending upgrade expired", needs_review: "Billing review required",
};

/** One controller per catalogue. Only explicit clicks create previews or write billing state. */
export function usePlanChangeDialog(account: PlanAccount | null, disabled: boolean, perform: PerformPlanAction) {
  const id = useId();
  const [review, setReview] = useState<Review | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  const feedback = useRef<HTMLDivElement | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);

  async function run(action: () => Promise<void>) {
    if (locked.current || disabled) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (caught) {
      if (mounted.current) setError(caught instanceof ApiError ? caught.message
        : "The request could not be confirmed. Refresh billing and review the saved request before retrying.");
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function choose(requested: PlanChoice) {
    if (locked.current || disabled || !choiceStillAvailable(requested, account)) return;
    const choice = freezeReview(requested);
    setError(""); setNotice(""); setReview({ kind: "choice", choice, quote: null });
    setIds(choice.kind === "renewal" ? account?.changes?.digests.slice(0, choice.option.max_digests).map(d => d.id) ?? [] : []);
    if (choice.kind === "upgrade") void run(async () => {
      const quote = await perform(() => subscriptionsApi.previewUpgrade({ code: choice.option.code, revision: choice.option.revision }));
      if (mounted.current) setReview({ kind: "choice", choice, quote: freezeReview(quote) });
    });
  }
  function cancelChange(requested: Change) {
    if (disabled || locked.current || !account || !canCancelPlanChange(requested) ||
        JSON.stringify(requested) !== JSON.stringify(account.changes?.change)) return;
    setError(""); setNotice("");
    setReview({ kind: "undo", change: freezeReview(requested), origin: planOrigin(account) });
  }
  function close() { if (!locked.current) { setReview(null); setError(""); } }
  function reviewQuote(quote: Upgrade) {
    if (disabled || locked.current || !account) return;
    setError(""); setReview({ kind: "quote", quote: freezeReview(quote), origin: planOrigin(account) });
  }
  async function savedUpgrade(action: "retry" | "payment") {
    const saved = account?.upgrades?.upgrade;
    if (!saved || (action === "retry" ? !saved.retry_allowed : !saved.payment_allowed)) return;
    await run(async () => {
      if (action === "payment") {
        const result = await perform(() => subscriptionsApi.payUpgrade(saved.id));
        if (mounted.current) window.location.assign(result.url);
      } else {
        await perform(() => subscriptionsApi.upgradeAction(saved.id, "retry"));
        if (mounted.current) setNotice("Saved upgrade checked. Review its verified status below.");
      }
    });
  }
  const choice = review?.kind === "choice" ? review.choice : null;
  const quote = review?.kind === "quote" ? review.quote : review?.kind === "choice" ? review.quote : null;
  const quoteOrigin = review?.kind === "quote" ? review.origin : choice?.origin;
  const quoteValid = !!quote && quote.confirm_allowed && Date.parse(quote.expires_at) > Date.now() &&
    !!account && account.access.billing_type === "stripe" && account.access.allowed && !account.access.payment_issue && !account.access.grace_until && quoteOrigin === planOrigin(account) && account.upgrades?.upgrade?.id === quote.id &&
    !!account.upgrades.upgrade.confirm_allowed && !hasPendingPlanChange(account.changes?.change);
  const choiceValid = !!choice && choiceStillAvailable(choice, account);
  const renewal = choice?.kind === "renewal" ? choice : null;
  const validIds = !!renewal && selectionIdsValid(ids, renewal.option, account?.changes?.digests ?? []);
  const undo = review?.kind === "undo" ? review.change : null;
  const undoValid = !!undo && !!account && review?.kind === "undo" && review.origin === planOrigin(account) &&
    JSON.stringify(undo) === JSON.stringify(account.changes?.change) && canCancelPlanChange(account.changes?.change);
  const allowed = !disabled && !busy && (quote ? quoteValid : renewal ? choiceValid && validIds : undo ? undoValid : choice?.kind === "free" && choiceValid);

  async function confirm() {
    if (!allowed || locked.current || (quote && Date.parse(quote.expires_at) <= Date.now()) || (undo && !canCancelPlanChange(undo))) return;
    await run(async () => {
      if (quote) {
        // The exact, server-priced quote is confirmed. Never call Checkout for a paid upgrade.
        const result = await perform(() => subscriptionsApi.upgradeAction(quote.id, "confirm"));
        if (!mounted.current) return;
        setReview(null); setNotice("Upgrade request submitted. Benefits follow verified payment, not this confirmation.");
        if (result.payment_allowed) {
          const payment = await perform(() => subscriptionsApi.payUpgrade(result.id));
          if (mounted.current) window.location.assign(payment.url);
        }
      } else if (renewal) {
        await perform(() => subscriptionsApi.schedule({ code: renewal.option.code, revision: renewal.option.revision,
          interval: renewal.option.interval, expected_period_end: renewal.effectiveAt, digest_ids: ids }));
        if (mounted.current) { setReview(null); setNotice("Change request submitted for renewal. Review its saved status below; no payment was requested now."); }
      } else if (undo) {
        const result = await perform(() => subscriptionsApi.changeAction(undo.id, "undo"));
        if (mounted.current) {
          setReview(null);
          setNotice(result.state === "undone"
            ? "Requested change cancelled. Your current plan and billing interval continue; your subscription is not cancelled. You can now choose a different plan."
            : "Cancellation of the requested change is not yet confirmed. Review its saved status before choosing another plan.");
        }
      } else if (choice?.kind === "free") {
        const result = await perform(() => subscriptionsApi.openBilling("cancel"));
        if (mounted.current) window.location.assign(result.url);
      }
    });
  }
  const u = account?.upgrades?.upgrade;
  const c = account?.changes?.change;
  const status = <Stack spacing={1.5} sx={{ mt: 2 }}>
    {notice && <Alert severity="info" role="status">{notice}</Alert>}
    {!review && error && <Alert severity="error" tabIndex={-1} ref={feedback}>{error}</Alert>}
    <Box id="upgrade" tabIndex={-1} sx={{ scrollMarginTop: 100 }}>
      {u && <Alert severity={u.error ? "warning" : u.state === "applied" ? "success" : "info"}>
        <Typography fontWeight={700}>{u.plan_name} · {upgradeStates[u.state] ?? u.state}</Typography>
        {u.error && <Typography>{u.error}</Typography>}
        {u.state === "pending_payment" && <Typography variant="body2">Your current paid plan remains subject to its existing payment terms. Complete payment before {u.pending_until ? date(u.pending_until) : "the pending update expires"}.</Typography>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {u.confirm_allowed && <Button disabled={disabled || busy} onClick={() => reviewQuote(u)}>Review saved preview</Button>}
          {u.payment_allowed && <Button variant="contained" color="success" disabled={disabled || busy} onClick={() => void savedUpgrade("payment")}>Complete payment securely</Button>}
          {u.retry_allowed && <Button disabled={disabled || busy} onClick={() => void savedUpgrade("retry")}>Check or retry saved upgrade</Button>}
        </Stack>
      </Alert>}
    </Box>
    <Box id="changes" tabIndex={-1} sx={{ scrollMarginTop: 100 }}>
      {c && <Alert severity={c.error ? "warning" : "info"}>
        <Typography fontWeight={700}>{c.plan_name} · {money(Number(c.price), c.currency)} / {intervalName(c.interval)} · {date(c.effective_at)}</Typography>
        <Typography>Status: {c.state.replaceAll("_", " ")}</Typography>
        {c.error && <Typography>{c.error}</Typography>}
        {c.state === "awaiting_payment" && <Typography>Payment verification is pending. Use Manage billing to update your payment method if needed.</Typography>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {c.undo_allowed && <Button disabled={disabled || busy || !canCancelPlanChange(c)} onClick={() => cancelChange(c)}>Undo scheduled change</Button>}
          {c.retry_allowed && <Button disabled={disabled || busy} onClick={() => void run(async () => {
            await perform(() => subscriptionsApi.changeAction(c.id, "retry"));
            if (mounted.current) setNotice("Saved change checked. Review its verified status.");
          })}>Retry saved request</Button>}
        </Stack>
      </Alert>}
    </Box>
  </Stack>;
  const title = quote || choice?.kind === "upgrade" ? "Continue to Payment?" : undo ? "Cancel requested change?"
    : choice?.kind === "free" ? `Downgrade to ${choice.plan.name}?` : renewal?.direction === "Upgrade" ? "Schedule upgrade at renewal?" : "Confirm change at renewal";
  const dialog = <Dialog open={!!review} onClose={close} fullWidth maxWidth="sm"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
    <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} id={`${id}-description`} sx={{ overflowWrap: "anywhere" }}>
        {account?.billing.sandbox && <Alert severity="warning">Sandbox testing only. Use Stripe test payment details; no real payment is collected.</Alert>}
        {choice?.kind === "upgrade" && !quote && <Typography role="status">{busy ? "Preparing the prorated payment preview…" : "The payment preview is not ready. Close this dialog and select the plan again after reviewing billing status."}</Typography>}
        {quote && <>
          <Typography variant="h6">{quote.plan_name}</Typography>
          <Typography>Unused-time credit: −{money(quote.credit / 100, quote.currency)}</Typography>
          <Typography>Remaining-period charge: {money(quote.charge / 100, quote.currency)}</Typography>
          <Typography fontWeight={750}>Due now: {money(quote.amount_due / 100, quote.currency)}</Typography>
          <Typography>Then {money(Number(quote.recurring_price), quote.currency)} / {intervalName(quote.interval)}, tax included, renewing {date(quote.period_end)}.</Typography>
          <Typography variant="body2">{quote.limits.max_digests} active digests · {quote.limits.runs_per_month} runs/month ({quote.limits.manual_runs_per_month} manual within that total) · {quote.limits.papers_per_month} papers/month · {quote.limits.max_papers_per_run} papers/run.</Typography>
          <Typography variant="body2">Schedules: {quote.limits.schedule_frequencies.join(", ") || "none"}. Email delivery: {quote.limits.email_delivery ? "included" : "not included"}.</Typography>
          <Typography variant="body2">Calculated at {date(quote.proration_at)}. Preview expires {date(quote.expires_at)}.</Typography>
          <Alert severity="info">Continue to Payment attempts the displayed charge using your saved Stripe payment method. If authentication or another payment method is needed, you will continue securely with Stripe. Benefits start only after payment verification. Monthly reset date and used allowance stay the same; paused schedules remain paused.</Alert>
          {!quoteValid && !busy && <Alert severity="warning">This preview is expired or no longer current. Close this dialog and review the saved request or obtain a new preview.</Alert>}
        </>}
        {choice?.kind === "upgrade" && choice.atRenewal && <Box>
          <Typography variant="body2">Prefer to keep your current plan until renewal? You can schedule this upgrade without paying now.</Typography>
          <Button variant="outlined" disabled={disabled || busy || !choiceStillAvailable(choice.atRenewal, account)}
            onClick={() => { if (choice.atRenewal) choose(choice.atRenewal); }}>Schedule this upgrade at renewal instead</Button>
        </Box>}
        {renewal && <>
          <Typography variant="h6">{choiceLabel(renewal)}</Typography>
          {renewal.intervalOnly && <Typography variant="body2">This interval-only change keeps your purchased plan revision. Its price and allowances can differ from the latest published cards.</Typography>}
          <Typography>{renewal.option.name} · {money(Number(renewal.option.price), renewal.option.currency)} / {intervalName(renewal.option.interval)}, tax included, starting {date(renewal.effectiveAt)}.</Typography>
          <Typography>No charge or proration now. The subscription renews at this recurring price. Current benefits continue under their existing payment terms until renewal. Monthly reset date and used allowance stay the same; lower limits can leave zero allowance until the next reset.</Typography>
          {renewal.direction === "Upgrade" && <Alert severity="info">Higher-plan benefits start only after the renewal invoice is paid and verified, not when you schedule this change. If payment fails or needs authentication, higher benefits remain unavailable until payment is verified. Yearly billing still has monthly research allowances, not a year's allowance upfront.</Alert>}
          <Typography variant="body2">{renewal.option.max_digests} active digests · {renewal.option.runs_per_month} runs/month ({renewal.option.manual_runs_per_month} manual within that total) · {renewal.option.papers_per_month} papers/month · {renewal.option.max_papers_per_run} papers/run.</Typography>
          <Typography variant="body2">Schedules: {renewal.option.schedule_frequencies.join(", ") || "none"}. Email delivery: {renewal.option.email_delivery ? "included" : "not included"}. All saved research is retained. Incompatible schedules pause and require explicit resumption.</Typography>
          {(account?.changes?.digests.length ?? 0) > renewal.option.max_digests && <Box>
            <Typography component="h3" variant="subtitle1">Choose {renewal.option.max_digests} digests to keep active</Typography>
            {account?.changes?.digests.map(d => <FormControlLabel key={d.id} label={d.topic} sx={{ display: "flex", alignItems: "flex-start" }}
              control={<Checkbox checked={ids.includes(d.id)} disabled={disabled || busy || (!ids.includes(d.id) && ids.length >= renewal.option.max_digests)}
                onChange={() => setIds(current => current.includes(d.id) ? current.filter(value => value !== d.id) : [...current, d.id])} />} />)}
          </Box>}
          {!validIds && <Alert severity="warning">Select exactly {Math.min(renewal.option.max_digests, account?.changes?.digests.length ?? 0)} available digests before confirming. Your digest list may have changed. <Button disabled={disabled || busy} onClick={() => setIds(account?.changes?.digests.slice(0, renewal.option.max_digests).map(d => d.id) ?? [])}>Reset digest selection</Button></Alert>}
        </>}
        {choice?.kind === "free" && <>
          <Typography>Cancel paid renewal and move to {account?.freeDigests?.plan_name || choice.plan.name} after verified paid access ends. No new payment is requested. Saved research is retained; incompatible schedules pause.</Typography>
          <Typography>{account?.freeDigests?.limit ?? "The Free plan's included"} digests can stay active on Free. Your saved Free digest preferences are unchanged by opening this dialog.</Typography>
          <Button component={Link} to="/radar/subscription#digests" onClick={close} disabled={busy}>Review active digest preferences</Button>
          <Alert severity="info">You will confirm cancellation on Stripe’s next screen. Closing this dialog or returning from Stripe does not confirm cancellation.</Alert>
        </>}
        {undo && <>
          <Typography>Cancel the requested change to {undo.plan_name} ({undo.interval === "annual" ? "Yearly" : "Monthly"}) on {date(undo.effective_at)}?</Typography>
          <Typography>Your current plan and billing interval will continue after cancellation of this change is confirmed. This does not cancel your subscription or request a refund.</Typography>
          <Typography variant="body2">To downgrade to a different plan, cancel this request first, wait for confirmation, then select the new target. For example, cancel Professional → Researcher before choosing Professional → Explorer.</Typography>
          <Typography variant="body2">Cancellation is unavailable during the final 30 seconds before renewal while the change starts.</Typography>
          {!undoValid && !busy && <Alert severity="warning">This request has changed or can no longer be cancelled. Refresh billing and review its current status.</Alert>}
        </>}
        {choice && !choiceValid && !busy && <Alert severity="warning">This option or your subscription has changed. Close this dialog and review the refreshed plans before continuing.</Alert>}
        {disabled && !busy && <Alert severity="warning">Refresh subscription and catalogue data before continuing. Changes are unavailable while account data is loading or in error.</Alert>}
        {error && <Alert severity="error" tabIndex={-1} ref={feedback}>{error}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
      <Button autoFocus={!!undo} disabled={busy} onClick={close}>{undo ? "Keep requested change" : "Cancel"}</Button>
      <Button variant="contained" color="success" disabled={!allowed} onClick={() => void confirm()}>
        {busy ? "Please wait…" : quote || choice?.kind === "upgrade" ? "Continue to Payment" : choice?.kind === "free" ? "Continue to cancellation" : undo ? "Cancel requested change" : renewal?.direction === "Upgrade" ? "Schedule upgrade" : "Confirm change at renewal"}
      </Button>
    </DialogActions>
  </Dialog>;
  return { busy, choose, cancelChange, notice, error, reviewing: !!review, status, dialog };
}
