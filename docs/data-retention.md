# Data retention policy and enforcement

Approved by the operator on **5 October 2026**. This is the Radar-controlled
technical policy; statutory/accounting/provider retention remains subject to the
operator's lawyer, accountant, and provider contracts.

| Category | Approved handling | Enforcement |
| --- | --- | --- |
| Open accounts, digests, runs, feedback | Retain while the account remains open; no inactivity expiry | Existing account/closure lifecycle |
| Unverified registration and reset/rate-limit records | Existing short operational expiry | Existing cleanup loop |
| Local PostgreSQL backups | 7 days | Existing `backup.sh` cleanup |
| Off-site database snapshots | 35 days | `offsite_backup.py retention` |
| Closure recovery checkpoints | 65 days (35-day backup window + 30-day margin) | Restic retention plus marker filtering |
| Reviewed ordinary in-app contact messages | 12 months after `reviewed_at` | Backend cleanup loop |
| Complaint/refund/privacy/dispute cases | No automatic deletion until adviser-approved legal/accounting period | Admin **Retention hold** |
| Radar host operational log files | 30 daily rotations | `radar-backup.logrotate` |
| Container stdout/stderr | Storage bounded by Docker local driver (3 × 10 MB per container) | Existing Compose logging policy; may expire earlier than 30 days under volume |
| External provider/mailbox/accounting records | Provider or adviser policy | Manual/provider configuration; not deleted by Radar cleanup |

## Contact-message hold

Mark a message **Retention hold** in Admin → Messages when it belongs to a
complaint, refund, privacy request, dispute, or another record whose retention
must follow legal/accounting advice. The automatic job deletes only messages
which:

1. have been marked reviewed,
2. are at least 365 days past `reviewed_at`, and
3. do not have a retention hold.

Unreviewed messages and held cases are not expired automatically. Removing a hold
returns the message to ordinary retention based on its existing review timestamp.

## Closure recovery markers

The restoration manifest exists to stop an older backup from reviving a closed
account. Once a closure request is older than 65 days, no pre-closure database
snapshot should remain under the approved 35-day backup policy, including the
30-day safety margin. New cumulative manifests therefore omit older markers.

This does **not** reactivate or reopen the live closed-account row. The application
continues to keep the minimum inactive-account guard required to make closure
irreversible. Provider, accounting, support-mailbox, and legal case records remain
outside this manifest rule.

## Legal holds and exceptions

Do not change database timestamps to bypass retention. A genuine legal,
accounting, fraud, security, complaint, refund, privacy, or dispute requirement
should preserve only the relevant records. In-app contact cases use the explicit
hold. Other exceptions remain documented manual procedures until an adviser
approves a dedicated workflow.
