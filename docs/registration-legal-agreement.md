# Registration legal agreement

Registration requires a separate affirmative checkbox before an email-verification
challenge can be created. The checkbox is not preselected and says that the user
**agrees to the Terms of Use** and **acknowledges the Privacy Notice**. Both labels
link directly to the public documents in a new tab so the registration form is
not lost.

The API independently requires `legal_agreement: true`; a client cannot bypass
the checkbox by calling the registration endpoint directly.

## Evidence recorded

When registration starts, the server records on the pending verification:

- server acceptance timestamp;
- current Terms version;
- current Privacy version.

A database-managed public document is recorded as `published:<revision>`. Until
the first database publication, the deployed fallback copy is
`builtin:2026-10-05`.

Email confirmation copies these values to the new account. If either Terms or
Privacy changes before confirmation, the old challenge is invalidated and the
user must start registration again and affirm the current documents.

Account closure removes these acceptance fields together with the live account's
personal profile. This increment deliberately does not invent a longer legal
retention period for contract evidence.

## Boundaries for legal review

This is initial-registration acceptance only. It does not:

- treat the Privacy Notice as consent for processing that relies on another legal
  basis;
- grant analytics, advertising, newsletter, or marketing consent;
- implement renewed acceptance when Terms materially change after registration;
- send a durable copy of the accepted Terms/Privacy by email;
- define how long contract-acceptance evidence must survive account closure.

Those points remain for the lawyer/accountant review before paid launch.
