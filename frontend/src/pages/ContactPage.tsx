import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { contactApi } from "../api/contact";
import { useAuth } from "../auth/AuthContext";
import { MarketingHeader } from "../components/MarketingHeader";

export function ContactPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const edited = useRef({ name: false, email: false });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // Session restoration may finish after the form mounts. Preserve any edits.
    if (!edited.current.name) setName(user?.full_name ?? "");
    if (!edited.current.email) setEmail(user?.email ?? "");
  }, [user?.full_name, user?.email]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setNotice(null);
    if (!name.trim() || !message.trim()) {
      setNotice({ severity: "error", text: "Please enter your name and a message." });
      return;
    }
    setSending(true);
    try {
      const result = await contactApi.send({ name: name.trim(), email: email.trim(), message: message.trim() });
      setMessage("");
      setNotice({ severity: "success", text: result.message });
    } catch (error) {
      setNotice({ severity: "error", text: error instanceof Error ? error.message : "Could not send your message. Please try again." });
    } finally { setSending(false); }
  }

  return <Box><MarketingHeader /><Container component="main" id="main-content" tabIndex={-1} maxWidth="sm" sx={{ py: { xs: 4, md: 7 } }}>
    <Typography component="h1" variant="h3" gutterBottom>Contact us</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Have a question, feedback, or a problem with Radar? Send a message to our administration team. Include an email address where we can reach you.</Typography>
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack component="form" onSubmit={submit} spacing={3}>
        <TextField label="Your name" required autoComplete="name" value={name} disabled={sending} inputProps={{ maxLength: 120 }} onChange={(event) => { edited.current.name = true; setName(event.target.value); setNotice(null); }} />
        <TextField label="Email address" required type="email" autoComplete="email" value={email} disabled={sending} inputProps={{ maxLength: 320 }} onChange={(event) => { edited.current.email = true; setEmail(event.target.value); setNotice(null); }} />
        <TextField label="Message" required multiline minRows={6} value={message} disabled={sending} inputProps={{ maxLength: 1000 }} helperText={`${message.length} / 1000 characters`} onChange={(event) => { setMessage(event.target.value); setNotice(null); }} />
        <Typography variant="body2" color="text.secondary">Your name, email, and message will be visible to Radar administrators. Please do not include passwords or payment details.</Typography>
        {notice && <Alert severity={notice.severity} role={notice.severity === "success" ? "status" : "alert"}>{notice.text}</Alert>}
        <Button type="submit" variant="contained" disabled={sending}>{sending ? "Sending…" : "Send message"}</Button>
      </Stack>
    </Paper>
  </Container></Box>;
}
