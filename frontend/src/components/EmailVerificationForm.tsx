import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";

export interface EmailVerification {
  id: string;
  email: string;
  sent_at: string;
  code_expires_at: string;
  expires_at: string;
}

function timestamp(value: string) {
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).getTime();
}

export function EmailVerificationForm({ challenge, registration = false, onConfirm, onResend, onCancel }: {
  challenge: EmailVerification;
  registration?: boolean;
  onConfirm: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((timestamp(challenge.sent_at) + 60000 - now) / 1000));
  const expired = now >= timestamp(challenge.expires_at);

  async function act(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not verify your email. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <Stack component="form" spacing={2} onSubmit={(event) => {
      event.preventDefault();
      if (!expired && /^[0-9]{6}$/.test(code) && !busy) void act(() => onConfirm(code));
    }}>
      <Typography variant="h6">Confirm your email address</Typography>
      <Alert severity={expired ? "warning" : "info"}>
        {expired ? "This verification attempt has expired. Please start again." :
          `Enter the 6-digit code sent to ${challenge.email}. Check your spam folder if it has not arrived.`}
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      <TextField label="6-digit verification code" value={code}
        onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
        autoComplete="one-time-code" required disabled={expired || busy}
        slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6, pattern: "[0-9]{6}" } }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button type="submit" variant="contained" disabled={expired || busy || code.length !== 6}>
          {busy ? "Please wait…" : "Confirm email"}
        </Button>
        <Button disabled={expired || busy || remaining > 0} onClick={() => void act(async () => {
          await onResend(); setCode(""); setNow(Date.now()); setNotice("A new code has been sent. Use the newest email.");
        })}>{remaining > 0 ? `Resend in ${remaining}s` : "Resend code"}</Button>
        <Button onClick={onCancel} disabled={busy}>{registration ? "Back to registration" : "Back to profile"}</Button>
      </Stack>
    </Stack>
  );
}
