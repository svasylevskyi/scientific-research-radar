import { Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { accountClosureApi, closureLabels, type AccountClosure } from "../api/accountClosure";
import { ApiError } from "../api/client";
import type { ContactMessage } from "../api/contact";

export function AdminAccountClosure({ userId }: { userId: string }) {
  const [value, setValue] = useState<AccountClosure | null>(null);
  const [contacts, setContacts] = useState<ContactMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutIds, setCheckoutIds] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await accountClosureApi.get(userId, controller.signal);
        if (controller.signal.aborted) return;
        setValue(next); setError(null);
        if (next?.state === "pending" || next?.state === "waiting") timer = setTimeout(load, 5000);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof ApiError ? caught.message : "Could not load closure progress."); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [userId, busy]);
  async function action(operation: () => Promise<AccountClosure>) {
    setBusy(true); setError(null);
    try { setValue(await operation()); setContacts([]); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  async function loadContacts() {
    setBusy(true); setError(null);
    try { setContacts(await accountClosureApi.contacts(userId)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not load messages."); }
    finally { setBusy(false); }
  }
  const stamp = (date: string | null) => date ? new Date(date).toLocaleString() : "Pending";
  return <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3, mb: 3 }}>
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography variant="h6">Account closure</Typography>
        {value && <Chip size="small" label={closureLabels[value.state]} color={value.state === "needs_review" ? "warning" : "default"} />}</Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {value && <>
        <Typography>Access is disabled. Closing accounts cannot be reactivated.</Typography>
        <Box><Typography>Requested: {stamp(value.requested_at)}</Typography>
          <Typography>Profile and research removed: {stamp(value.data_removed_at)}</Typography>
          <Typography>Billing resolved: {stamp(value.billing_resolved_at)}</Typography>
          <Typography>Completed: {stamp(value.completed_at)}</Typography>
          <Typography>Closure email: {value.notice_state}</Typography></Box>
        {value.last_error && <Alert severity={value.state === "needs_review" ? "warning" : "info"}>{value.last_error}</Alert>}
        {value.billing_issues.filter((item) => item.kind !== "contact_review").map((item) => <Box key={`${item.kind}:${item.reference}`}>
          <Typography sx={{ overflowWrap: "anywhere" }}>{item.kind === "unknown_checkout" ? "Unconfirmed checkout" : item.kind === "invoice" ? "Unsettled invoice" : "Pending invoice item"}: {item.reference}</Typography>
          {item.kind === "unknown_checkout" && item.attempt_id && <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">Find the original session in Stripe using this attempt ID in its metadata. Link it here so closure can verify and expire it. Do not create another checkout.</Typography>
            <TextField size="small" label="Original Stripe checkout session ID" value={checkoutIds[item.attempt_id] ?? ""}
              onChange={(event) => setCheckoutIds((previous) => ({ ...previous, [item.attempt_id!]: event.target.value }))} />
            <Button disabled={busy || !checkoutIds[item.attempt_id]} sx={{ alignSelf: "flex-start" }}
              onClick={() => action(() => accountClosureApi.recover(userId, item.attempt_id!, (checkoutIds[item.attempt_id!] ?? "").trim()))}>Verify and link checkout</Button>
          </Stack>}
        </Box>)}
        {value.billing_issues.some((item) => item.kind === "contact_review") && <>
          <Typography>Older anonymous messages use this account’s email. Confirm ownership before deleting them; an email match alone is not proof.</Typography>
          <Button disabled={busy} onClick={loadContacts} sx={{ alignSelf: "flex-start" }}>Review matching contact messages</Button>
          {contacts.map((message) => <Box key={message.id}>
            <Divider sx={{ mb: 1 }} /><Typography fontWeight={700}>{message.name} — {message.email}</Typography>
            <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.message}</Typography>
            <Button color="error" disabled={busy} onClick={() => {
              if (window.confirm("Confirm this message belongs to the closing account and permanently delete it?")) void action(() => accountClosureApi.reviewContact(userId, message.id, "delete"));
            }}>Confirm ownership and delete message</Button>
            <Button disabled={busy} onClick={() => {
              if (window.confirm("Confirm this message belongs to someone else and should be left outside this closure?")) void action(() => accountClosureApi.reviewContact(userId, message.id, "unrelated"));
            }}>Message belongs to someone else</Button>
          </Box>)}
        </>}
        {value.state !== "completed" && <Button variant="outlined" disabled={busy} sx={{ alignSelf: "flex-start" }}
          onClick={() => action(() => accountClosureApi.retry(userId))}>Recheck and continue closure</Button>}
        <Typography variant="body2" color="text.secondary">Resolve outstanding invoices and refund requests in the Stripe Dashboard. This workflow does not issue refunds or waive debts. Rechecking calls Stripe when billing remains.</Typography>
      </>}
    </Stack>
  </Paper>;
}
