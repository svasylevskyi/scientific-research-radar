# About and Contact pages

The public `/about` and `/contact` pages are linked from the marketing header and site footer. The About page describes the existing research workflow without promising exhaustive coverage or verified AI output.

The Contact form accepts a name (up to 120 characters), email address, and message (up to 1,000 characters). Signed-in visitors receive editable name/email defaults, including after session restoration. Submission is public and the sender details are self-reported; they are not proof of account ownership.

Messages are stored in the application database and delivered to **Admin → Messages** (`/admin/messages`). All administrators can read them and explicitly mark them reviewed or new. Opening a message does not mark it reviewed. There is no outgoing email notification or in-app reply workflow in this increment. Administrators can use the supplied address to respond through their normal support channel.

Deployment applies migration `20260915_0027` to create the inbox table. No new environment variables are required. Normal database backups include these records. Downgrading this migration removes stored contact messages.

The public endpoint uses the existing shared rate limiter: five submission attempts per IP per hour, in addition to the global API limits. The API validates inputs independently of the form. Message contents are displayed as plain text. Only authenticated administrators can list or change review status.

Acceptance checks:

- Open About and Contact from both marketing navigation and footer, on desktop and mobile.
- Submit while signed out; confirm the message appears in the admin inbox.
- Open Contact while signed in, including a page reload; verify full name/email defaults remain editable.
- Verify blank fields, invalid email, the 1,000-character limit, and preservation of input after a failed submission.
- Check long names, multiline messages, and text containing HTML in the admin inbox and review dialog.
- Mark a message reviewed, reload, then mark it new. Confirm a regular non-admin account cannot open the inbox.
