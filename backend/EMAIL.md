# Email delivery and verification

Run `alembic upgrade head` before starting this version (migration `20260907_0008`). Existing accounts remain active. Pending registrations are stored separately and cannot sign in or access user resources.

## SMTP setup

Set these values in `backend/.env` using your email provider's SMTP credentials:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
EMAIL_FROM=no-reply@your-verified-domain.com
SMTP_TIMEOUT_SECONDS=15
```

Use `SMTP_SECURITY=ssl` and port 465 if your provider requires implicit TLS. `none` is available for a trusted local test SMTP server. Configure the sender domain with the provider (including SPF/DKIM as instructed by them). Restart the API after configuration changes. Missing configuration or delivery failure returns `503` with a user-visible error; there is no silent fallback or code logging.

The generic `EmailService.send(OutgoingEmail(...))` in `app/services/email_service.py` supports a recipient, subject, plain text, and optional HTML. It uses Python's standard-library SMTP client; no paid library or extra worker is required. An SMTP provider may charge for delivery. There is intentionally no public arbitrary-email sending endpoint. Tests replace the transport and send no real emails.

## Verification behavior

- Registration POST returns challenge ID, email, sent time, code expiry and attempt expiry, with no authenticated session. Confirming the code creates the account and session atomically. Store the challenge ID to confirm/resend; treat it as sensitive and do not put it in analytics or logs.
- Codes are random six-digit strings, including leading zeros. Only a keyed hash is stored. A code is valid for 24 hours after sending, subject to the attempt deadline. A new code invalidates the previous code.
- Resend is allowed after 60 seconds. Every attempt has a fixed 24-hour deadline from its creation; resends do not extend it. Thus a registration started yesterday cannot be kept alive indefinitely by resending. Both email and UI display the attempt deadline.
- Failed confirmations are counted atomically, with a maximum of 50 per attempt. Resending does not reset the count. After the limit, wait for expiry and start again. Confirmation is one-time and checks email uniqueness again when applying the change.
- Repeating registration with the same email and password recovers the pending challenge without sending another email or changing its data. A different password cannot replace an active registration attempt. In the browser, the challenge metadata persists in session storage across refresh; passwords and codes are not stored there.
- Profile email changes require an authenticated session and verification by the same account. The old email remains active until confirmation. Name updates are independent. Expired changes leave the old email untouched. Admin account management remains a privileged, separate flow.
- A cleanup task runs at API startup and every 60 seconds to physically delete expired attempts and their pending password hashes. All endpoints enforce expiry immediately, even before cleanup runs. When the API is offline, expired data is purged when it next starts. Starting a new attempt also clears expired reservations.
- SMTP submission is synchronous with a bounded timeout, with no automatic retry. A failed send rolls back the challenge update, preserving the previous code on resend failure. SMTP acceptance does not guarantee inbox delivery; users can check spam and resend. A database failure after SMTP acceptance can leave a delivered code unusable; the UI reports failure and the user can retry.

## API changes

See the endpoint table in the root README. Clients must handle `202` registration responses and call confirmation before expecting tokens. Direct profile PATCH requests that change email return `409` and direct clients to verification. Registration and verification responses never expose codes or password hashes.

## Scheduled briefing delivery

The separate `python -m app.scheduler.worker` process delivers stored completed scheduled briefings when email is enabled (default). Configure `FRONTEND_BASE_URL` with your public site address as well as SMTP. The existing verification email path remains immediate; briefing delivery uses a durable queue with bounded retries. See the README scheduling section for activation, retry, and SMTP duplicate-delivery semantics. The template is `backend/app/services/briefing_email.py`.
