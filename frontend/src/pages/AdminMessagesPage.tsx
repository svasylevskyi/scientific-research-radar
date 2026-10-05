import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import { Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { contactApi, type ContactMessage } from "../api/contact";
import { ApiError } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { AdminListFooter, AdminPageHeading } from "../components/AdminSupport";
import { adminDate, matchingUsersPath } from "../admin/support";
import { pageNumber, queryPath, updateQuery } from "../navigationContext";

const PAGE_SIZE = 20;
type Notice = { id: string; severity: "success" | "error" | "warning"; text: string; focus?: boolean };
export function AdminMessagesPage() {
  const [search, setSearch] = useSearchParams();
  const page = pageNumber(search);
  const selectedId = search.get("message_id") ?? "";
  const revision = useRef(0);
  const locked = useRef(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [patches, setPatches] = useState<Record<string, { item: ContactMessage; revision: number }>>({});
  const noticeRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const readRevision = revision.current;
    return { ...await contactApi.list(page, signal), revision: readRevision };
  }, [page]);
  const resource = usePollingResource(load, 0);
  useListPageBounds(page, resource.data?.total, PAGE_SIZE, setSearch);
  // A GET begun before a successful PATCH cannot overwrite that PATCH's result.
  // The next post-write read is authoritative, including changes by other admins.
  const items = (resource.data?.items ?? []).map(item => {
    const patch = patches[item.id];
    return patch && patch.revision > (resource.data?.revision ?? -1) ? patch.item : item;
  });
  const selected = items.find(item => item.id === selectedId) ?? null;
  const total = resource.data?.total ?? 0;
  const activeNotice = notice?.id === selectedId ? notice : null;
  useEffect(() => { setNotice(null); }, [selectedId, page]);
  useEffect(() => {
    if (!activeNotice?.focus) return;
    noticeRef.current?.scrollIntoView({ block: "nearest" });
    noticeRef.current?.focus({ preventScroll: true });
  }, [activeNotice]);
  const setPage = (value: number) => setSearch(current => updateQuery(current,
    { page: value === 1 ? null : value, message_id: null }), { preventScrollReset: true });
  function open(item: ContactMessage) {
    setNotice(null);
    setSearch(current => updateQuery(current, { message_id: item.id }), { preventScrollReset: true });
  }
  function close() {
    if (locked.current) return;
    setSearch(current => updateQuery(current, { message_id: null }), { replace: true, preventScrollReset: true });
  }
  async function toggleReview() {
    if (!selected || locked.current || resource.error) return;
    const item = selected;
    locked.current = true;
    revision.current += 1;
    setSaving(true); setNotice(null);
    try {
      const updated = await contactApi.review(item.id, !item.reviewed_at);
      revision.current += 1;
      const writeRevision = revision.current;
      setPatches(current => ({ ...current, [updated.id]: { item: updated, revision: writeRevision } }));
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "success",
        text: updated.reviewed_at ? "Message marked reviewed. No reply was sent." : "Message marked as new. No reply was sent." });
    } catch (caught) {
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "error", focus: true,
        text: caught instanceof ApiError ? caught.message : "Could not update the review status. Refresh and check it before trying again." });
    } finally {
      locked.current = false;
      setSaving(false);
      // Also reconcile ambiguous failures. Failed reads retain ResourceNotice's
      // stale-data warning and block further review writes until refreshed.
      void resource.refresh();
    }
  }
  async function toggleRetentionHold() {
    if (!selected || locked.current || resource.error) return;
    const item = selected;
    locked.current = true;
    revision.current += 1;
    setSaving(true); setNotice(null);
    try {
      const updated = await contactApi.setRetentionHold(item.id, !item.retention_hold);
      revision.current += 1;
      const writeRevision = revision.current;
      setPatches(current => ({ ...current, [updated.id]: { item: updated, revision: writeRevision } }));
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "success",
        text: updated.retention_hold
          ? "Retention hold enabled. Automatic 12-month cleanup will not delete this case."
          : "Retention hold removed. Ordinary reviewed-message retention applies." });
    } catch (caught) {
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "error", focus: true,
        text: caught instanceof ApiError ? caught.message : "Could not update the retention hold. Refresh and check it before trying again." });
    } finally {
      locked.current = false;
      setSaving(false);
      void resource.refresh();
    }
  }

  async function copyEmail() {
    if (!selected) return;
    const item = selected;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(item.email);
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "success", text: "Email address copied." });
    } catch {
      if (selectedRef.current === item.id) setNotice({ id: item.id, severity: "warning",
        text: "Could not copy automatically. Select and copy the email address shown above." });
    }
  }
  const status = (item: ContactMessage) => <Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap">
    <Chip size="small" label={item.reviewed_at ? "Reviewed" : "New"}
      color={item.reviewed_at ? "default" : "info"} variant="outlined" />
    {item.retention_hold && <Chip size="small" label="Retention hold" color="warning" variant="outlined" />}
  </Stack>;
  const reviewButton = (item: ContactMessage) => <Button onClick={() => open(item)}
    aria-label={`Review message from ${item.name}`}>Review message</Button>;
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
    <AdminPageHeading title="Contact messages" description="Review visitor messages. Review status records that a message has been checked, not answered or resolved. Times use your local time zone."
      actions={<Button disabled={saving || resource.loading || resource.retrying || resource.retryAt > Date.now()} onClick={() => void resource.refresh()}>Refresh</Button>} />
    <ResourceNotice {...resource} />
    {resource.loading ? <Box role="status" aria-label="Loading messages" sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress size={34} /></Box>
      : resource.data && <>
        {selectedId && !selected && <Alert severity="info" sx={{ mb: 2 }}>
          The selected message is not available on this page. It may have moved as new messages arrived; no other message has been opened.
          <Button onClick={close}>Clear selection</Button>
        </Alert>}
        {!items.length ? <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="h6">{total ? "No messages on this page" : "No contact messages yet"}</Typography>
          <Typography color="text.secondary">Visitor messages will appear here. A review does not send an email.</Typography>
        </Paper> : <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: "none", md: "block" }, borderRadius: 3 }}>
            <Table aria-label="Contact messages" sx={{ "& th, & td": { overflowWrap: "anywhere" } }}>
              <TableHead><TableRow>{["Received", "Sender", "Message preview", "Review status", "Actions"].map(label =>
                <TableCell key={label} scope="col" align={label === "Actions" ? "right" : "left"}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>{items.map(item => <TableRow key={item.id} hover>
                <TableCell>{adminDate(item.created_at)}</TableCell>
                <TableCell component="th" scope="row"><Typography fontWeight={700}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.email}</Typography></TableCell>
                <TableCell sx={{ maxWidth: 420 }}>{item.message.slice(0, 100)}{item.message.length > 100 ? "…" : ""}</TableCell>
                <TableCell>{status(item)}</TableCell><TableCell align="right">{reviewButton(item)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>{items.map(item =>
            <Paper key={item.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3, overflowWrap: "anywhere" }}>
              <Stack direction="row" justifyContent="space-between" gap={1} useFlexGap flexWrap="wrap"><Typography fontWeight={700}>{item.name}</Typography>{status(item)}</Stack>
              <Typography variant="body2" color="text.secondary">{item.email}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Received {adminDate(item.created_at)}</Typography>
              <Typography sx={{ my: 1.5 }}>{item.message.slice(0, 100)}{item.message.length > 100 ? "…" : ""}</Typography>
              {reviewButton(item)}
            </Paper>)}</Stack>
        </>}
        <AdminListFooter page={page} pageSize={PAGE_SIZE} total={total} count={items.length} noun="messages" onChange={setPage} />
      </>}
    <Dialog key={selectedId} open={!!selected} onClose={close} fullWidth maxWidth="sm" aria-labelledby="contact-message-title" aria-describedby="contact-identity-note">
      <DialogTitle id="contact-message-title">Contact message</DialogTitle>
      <DialogContent>{selected && <Stack spacing={2.5} sx={{ overflowWrap: "anywhere" }}>
        <Box><Typography component="h2" variant="h6">{selected.name}</Typography>
          <Typography sx={{ userSelect: "all" }}>{selected.email}</Typography>
          <Typography variant="body2" color="text.secondary">Received {adminDate(selected.created_at)}</Typography></Box>
        <Typography id="contact-identity-note" variant="body2" color="text.secondary">
          Sender details are supplied by the visitor. A matching user account does not verify ownership or authenticate this message.
        </Typography>
        <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
          <Button onClick={() => void copyEmail()} disabled={saving}>Copy email address</Button>
          <Button component={RouterLink} disabled={saving} to={matchingUsersPath(selected.email,
            queryPath("/admin/messages", updateQuery(search, { message_id: selected.id })))}>Find matching users</Button>
        </Stack>
        {selected.email.trim().length > 120 && <Typography variant="body2">User search uses the first 120 characters of this address.</Typography>}
        <Box><Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Message</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{selected.message}</Typography></Box>
        <Box>{status(selected)}<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {selected.reviewed_at ? `Reviewed ${adminDate(selected.reviewed_at)}` : "Not yet reviewed"}. Review status does not record a reply or resolution.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Ordinary reviewed messages are deleted automatically after 12 months. Use retention hold for complaints, refunds, privacy requests, disputes, or other records that must follow a manual legal/accounting retention decision.
        </Typography></Box>
        {resource.error && <Alert severity="warning">The message list could not refresh. Review actions are paused; close this dialog and retry the read.</Alert>}
        {activeNotice && <Alert ref={noticeRef} tabIndex={-1} severity={activeNotice.severity}
          role={activeNotice.severity === "error" ? "alert" : "status"}>{activeNotice.text}</Alert>}
      </Stack>}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: "wrap", gap: 1 }}>
        <Button autoFocus disabled={saving} onClick={close}>Close</Button>
        <Button color={selected?.retention_hold ? "warning" : "inherit"} disabled={saving || !!resource.error || !selected}
          onClick={() => void toggleRetentionHold()}>
          {selected?.retention_hold ? "Remove retention hold" : "Retain as legal/financial case"}
        </Button>
        <Button variant="contained" disabled={saving || !!resource.error || !selected} onClick={() => void toggleReview()}>
          {saving ? "Saving…" : selected?.reviewed_at ? "Mark as new" : "Mark reviewed"}
        </Button>
      </DialogActions>
    </Dialog>
  </Container></Box>;
}
