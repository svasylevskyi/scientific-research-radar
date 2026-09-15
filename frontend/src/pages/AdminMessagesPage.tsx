import { Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { contactApi, type ContactMessage } from "../api/contact";
import { AppHeader } from "../components/AppHeader";

function displayDate(value: string) {
  return new Date(value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`).toLocaleString();
}

export function AdminMessagesPage() {
  const [items, setItems] = useState<ContactMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    contactApi.list(page).then((result) => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not load messages."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh]);

  function open(item: ContactMessage) { setSelected(item); setReviewError(null); }
  async function toggleReview() {
    if (!selected || saving) return;
    setSaving(true); setReviewError(null);
    try {
      const updated = await contactApi.review(selected.id, !selected.reviewed_at);
      setSelected(updated);
      setItems((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { setReviewError(error instanceof Error ? error.message : "Could not update message."); }
    finally { setSaving(false); }
  }
  return <Box><AppHeader /><Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
      <Box><Typography component="h1" variant="h3">Contact messages</Typography><Typography color="text.secondary">Review messages sent to the Radar administration team. Sender details are supplied by the visitor.</Typography></Box>
      <Button disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>
    </Stack>
    {error && <Alert severity="error" action={<Button onClick={() => setRefresh((value) => value + 1)}>Retry</Button>}>{error}</Alert>}
    {loading ? <CircularProgress aria-label="Loading messages" /> : !error && <>
      {!items.length ? <Paper variant="outlined" sx={{ p: 3 }}>No contact messages yet.</Paper> : <>
        <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: "none", md: "block" } }}><Table>
          <TableHead><TableRow>{["Received", "Sender", "Message", "Status", ""].map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{items.map((item) => <TableRow key={item.id}>
            <TableCell>{displayDate(item.created_at)}</TableCell><TableCell sx={{ overflowWrap: "anywhere" }}>{item.name}<Typography variant="body2" color="text.secondary">{item.email}</Typography></TableCell>
            <TableCell sx={{ maxWidth: 300, overflowWrap: "anywhere" }}>{item.message.slice(0, 100)}{item.message.length > 100 ? "…" : ""}</TableCell>
            <TableCell><Chip size="small" label={item.reviewed_at ? "Reviewed" : "New"} color={item.reviewed_at ? "default" : "info"} /></TableCell>
            <TableCell><Button onClick={() => open(item)} aria-label={`Review message from ${item.name}`}>Review</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
        <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>{items.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 2, overflowWrap: "anywhere" }}>
          <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={700}>{item.name}</Typography><Chip size="small" label={item.reviewed_at ? "Reviewed" : "New"} /></Stack>
          <Typography variant="body2">{item.email}</Typography><Typography variant="caption" color="text.secondary">{displayDate(item.created_at)}</Typography>
          <Typography sx={{ my: 1 }}>{item.message.slice(0, 100)}{item.message.length > 100 ? "…" : ""}</Typography>
          <Button onClick={() => open(item)}>Review message</Button>
        </Paper>)}</Stack>
      </>}
      {total > 20 && <Pagination sx={{ mt: 3 }} count={Math.ceil(total / 20)} page={page} onChange={(_, value) => setPage(value)} />}
    </>}
    <Dialog open={!!selected} onClose={() => { if (!saving) setSelected(null); }} fullWidth maxWidth="sm" aria-labelledby="contact-message-title">
      <DialogTitle id="contact-message-title">Contact message</DialogTitle>
      <DialogContent>{selected && <Stack spacing={2} sx={{ overflowWrap: "anywhere" }}>
        <Box><Typography fontWeight={700}>{selected.name}</Typography><Typography>{selected.email}</Typography><Typography variant="body2" color="text.secondary">Received {displayDate(selected.created_at)}</Typography></Box>
        <Typography sx={{ whiteSpace: "pre-wrap" }}>{selected.message}</Typography>
        <Typography variant="body2" color="text.secondary">{selected.reviewed_at ? `Reviewed ${displayDate(selected.reviewed_at)}` : "Not yet reviewed"}</Typography>
        {reviewError && <Alert severity="error">{reviewError}</Alert>}
      </Stack>}</DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setSelected(null)}>Close</Button><Button variant="contained" disabled={saving} onClick={() => void toggleReview()}>{saving ? "Saving…" : selected?.reviewed_at ? "Mark as new" : "Mark reviewed"}</Button></DialogActions>
    </Dialog>
  </Container></Box>;
}
