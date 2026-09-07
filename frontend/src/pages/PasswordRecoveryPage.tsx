import { Alert, Box, Button, Checkbox, FormControlLabel, Link, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ApiError, AUTH_EXPIRED_EVENT, setAccessToken } from "../api/client";
import { authApi } from "../api/auth";
import { isValidNewPassword, passwordRequirementsText } from "../auth/passwordRequirements";
import { AuthLayout } from "../layouts/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { setMessage((await authApi.forgotPassword(email.trim())).message); }
    catch (caught) { setError(caught instanceof ApiError ? "Could not request a reset link. Check your email address and try again." : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }

  return <AuthLayout>
    <Typography component="h1" variant="h3" sx={{ mb: 2 }}>Forgot your password?</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>Enter your account email and we’ll send you a link to choose a new password. The link is valid for 30 minutes.</Typography>
    <Stack component="form" onSubmit={submit} spacing={2}>
      {message && <Alert severity="info">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <TextField label="Email address" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} fullWidth />
      <Button type="submit" variant="contained" disabled={busy}>{busy ? "Requesting…" : "Send reset link"}</Button>
    </Stack>
    <Box sx={{ mt: 3 }}><Link component={RouterLink} to="/login">Back to sign in</Link></Box>
  </AuthLayout>;
}

export function ResetPasswordPage() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Fragment tokens never reach HTTP access logs; remove the fragment from browser history too.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const meta = document.createElement("meta");
    meta.name = "referrer"; meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validToken) return;
    setError(null);
    if (!isValidNewPassword(password)) { setError(passwordRequirementsText); return; }
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      await authApi.resetPassword(token, password, confirmation);
      setToken(""); setPassword(""); setConfirmation(""); setDone(true);
      setAccessToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not reset your password. Please try again."); }
    finally { setBusy(false); }
  }

  return <AuthLayout>
    <Typography component="h1" variant="h3" sx={{ mb: 3 }}>Choose a new password</Typography>
    {done ? <Alert severity="success">Your password has been reset. Existing sessions have been signed out.</Alert> : !validToken ?
      <Alert severity="warning">Open the link in your password recovery email, or request a new link below.</Alert> :
      <Stack component="form" onSubmit={submit} spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="New password" type={visible ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} helperText={passwordRequirementsText} required disabled={busy} fullWidth slotProps={{ htmlInput: { maxLength: 128 } }} />
        <TextField label="Confirm new password" type={visible ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={busy} fullWidth slotProps={{ htmlInput: { maxLength: 128 } }} />
        <FormControlLabel control={<Checkbox checked={visible} onChange={(event) => setVisible(event.target.checked)} />} label="Show passwords" />
        <Button type="submit" variant="contained" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</Button>
      </Stack>}
    <Stack spacing={1.5} sx={{ mt: 3 }}>
      <Link component={RouterLink} to="/login">Sign in</Link>
      {!done && <Link component={RouterLink} to="/forgot-password">Request a new reset link</Link>}
    </Stack>
  </AuthLayout>;
}
