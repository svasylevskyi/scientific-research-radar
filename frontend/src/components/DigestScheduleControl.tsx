import type { useSubscriptionAccess } from "../hooks/useSubscriptionAccess";
type AccessState = ReturnType<typeof useSubscriptionAccess>;
import { ScheduleOutlook } from "./ScheduleOutlook";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { Alert, Box, Button, Checkbox, FormControlLabel, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { digestsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import type { Digest, DigestFrequency, DigestSchedule } from "../types/digest";
import { frequencyLabel, localScheduleInput, scheduleDateErrors, scheduleFrequencies } from "../schedulePresentation";

const focusStyle = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };
function reveal(target: HTMLElement | null) {
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: "nearest" });
}

function ScheduleForm({ digestId, schedule, onSaved, onCancel, access }: {
  access: AccessState;
  digestId: string;
  schedule: DigestSchedule | null;
  onSaved: (digest: Digest | null) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const allowedFrequencies: readonly DigestFrequency[] = access.data?.plan?.configuration.schedule_frequencies ?? scheduleFrequencies;
  const emailAllowed = access.data?.plan?.configuration.email_delivery ?? true;
  const unavailable = !access.data?.schedule_allowed || !!access.error;
  const [frequency, setFrequency] = useState<DigestFrequency>(schedule?.frequency ?? (allowedFrequencies.includes("weekly") ? "weekly" : allowedFrequencies[0] ?? "weekly"));
  const [sendEmail, setSendEmail] = useState(schedule?.send_email ?? emailAllowed);
  const { user } = useAuth();
  const [startsAt, setStartsAt] = useState(() => localScheduleInput(schedule ? new Date(schedule.starts_at) : new Date(Date.now() + 86400000)));
  const [endsAt, setEndsAt] = useState(() => schedule?.ends_at ? localScheduleInput(new Date(schedule.ends_at)) : "");
  const [error, setError] = useState<string | null>(null);
  const [dateErrors, setDateErrors] = useState<{ start?: string; end?: string }>({});
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [deleteFocusVersion, setDeleteFocusVersion] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  // Pin the editing context and drafts; server polling must not rewrite either.
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [savedTimeZone] = useState(schedule?.time_zone ?? null);
  useEffect(() => { reveal(headingRef.current); }, []);
  useEffect(() => { if (focusVersion) reveal(errorRef.current); }, [focusVersion]);
  useEffect(() => { if (deleteFocusVersion) reveal(deleteErrorRef.current); }, [deleteFocusVersion]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || busy || unavailable || !allowedFrequencies.includes(frequency) || (sendEmail && !emailAllowed)) return;
    setError(null);
    const errors = scheduleDateErrors(startsAt, endsAt);
    setDateErrors(errors);
    if (errors.start || errors.end) {
      setFocusVersion(value => value + 1);
      return;
    }
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    locked.current = true;
    setBusy(true);
    try {
      const saved = await digestsApi.saveSchedule(digestId, {
        frequency, starts_at: start.toISOString(), ends_at: end?.toISOString() ?? null, time_zone: timeZone, send_email: sendEmail,
      });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the schedule. Please try again.");
      setFocusVersion(value => value + 1);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function deleteSchedule() {
    if (locked.current || busy) return;
    locked.current = true;
    setBusy(true);
    setDeleting(true);
    setDeleteError(null);
    try {
      await digestsApi.deleteSchedule(digestId);
      onSaved(null);
    } catch (caught) {
      // Keep the confirmation open so a failed delete is never mistaken for success.
      setDeleteError(caught instanceof ApiError ? caught.message : "Could not delete the schedule. Please try again.");
      setDeleteFocusVersion(value => value + 1);
    } finally {
      locked.current = false;
      setDeleting(false);
      setBusy(false);
    }
  }

  return (
    <Box component="form" id={`schedule-form-${digestId}`} onSubmit={save} noValidate
      aria-labelledby={`${id}-heading`} aria-busy={busy}
      sx={{ mt: 3, width: "100%", maxWidth: 960, minWidth: 0, mx: "auto", overflowWrap: "anywhere" }}>
      <Stack spacing={2}>
        <Typography component="h3" variant="h6" id={`${id}-heading`} ref={headingRef} tabIndex={-1} sx={focusStyle}>
          {schedule ? "Update schedule" : "Set up scheduled research"}
        </Typography>
        <Typography variant="body2" color="text.secondary" id={`${id}-time-zone`}>
          All dates and times below use {timeZone}. Saving enables automatic runs, subject to your plan and available allowances.
          Scheduled runs use a rolling reporting period with the same length as your digest. A start time is not a delivery time.
          Fields marked * are required.
        </Typography>
        {savedTimeZone && savedTimeZone !== timeZone && <Alert severity="warning" role="note">
          This schedule was saved in {savedTimeZone}. The fields below show its dates in {timeZone}.
          Saving will use {timeZone} for future recurrence. Review the times before saving, or cancel to keep the saved schedule unchanged.
        </Alert>}
        {unavailable && <Typography variant="body2" color="text.secondary">
          Saving is unavailable while scheduling access cannot be confirmed. Your edits are kept; review the allowance notice above.
          {schedule && " You can still delete the existing schedule."}
        </Typography>}
        {(error || dateErrors.start || dateErrors.end) && <Alert severity="error" role="alert" ref={errorRef} tabIndex={-1} sx={focusStyle}>
          <Typography fontWeight={700}>{error ? "Schedule not saved" : "Check the schedule dates"}</Typography>
          {error && <Typography variant="body2">{error} Your entered values are still shown.</Typography>}
          {dateErrors.start && <Button type="button" color="inherit" onClick={() => reveal(startRef.current)} sx={{ textAlign: "left", whiteSpace: "normal" }}>
            First date: {dateErrors.start}
          </Button>}
          {dateErrors.end && <Button type="button" color="inherit" onClick={() => reveal(endRef.current)} sx={{ textAlign: "left", whiteSpace: "normal" }}>
            End date: {dateErrors.end}
          </Button>}
        </Alert>}
        <TextField id={`${id}-frequency`} select label="Digest frequency" value={frequency}
          onChange={(event) => setFrequency(event.target.value as DigestFrequency)} required disabled={busy || unavailable} fullWidth
          error={!allowedFrequencies.includes(frequency)} helperText={!allowedFrequencies.includes(frequency) ? "Choose an included frequency before saving." : "How often to start research. Frequency does not increase your allowances."}>
          {scheduleFrequencies.map((value) => <MenuItem key={value} value={value} disabled={!allowedFrequencies.includes(value)}>{frequencyLabel(value)}{!allowedFrequencies.includes(value) ? " — not included" : ""}</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField id={`${id}-start`} inputRef={startRef} label="First digest date and time" type="datetime-local" value={startsAt}
            onChange={(event) => { setStartsAt(event.target.value); setDateErrors({}); }} error={!!dateErrors.start}
            helperText={dateErrors.start ?? `Planned research start in ${timeZone}.`} required disabled={busy || unavailable} fullWidth
            sx={{ minWidth: 0 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id={`${id}-end`} inputRef={endRef} label="End date and time (optional)" type="datetime-local" value={endsAt}
            onChange={(event) => { setEndsAt(event.target.value); setDateErrors({}); }} error={!!dateErrors.end} disabled={busy || unavailable} fullWidth
            helperText={dateErrors.end ?? "No runs start at or after this cutoff. Leave empty for no end date."}
            sx={{ minWidth: 0 }} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <FormControlLabel sx={{ alignItems: "flex-start", m: 0, "& .MuiFormControlLabel-label": { pt: 1, overflowWrap: "anywhere" } }}
          control={<Checkbox checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} disabled={busy || unavailable || (!emailAllowed && !sendEmail)} />}
          label={`Email completed briefings to ${user?.email ?? "the email in your profile"}`} />
        {!emailAllowed && <Typography variant="body2">Email delivery is not included in this plan. Keep email disabled to save this schedule.</Typography>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ "& > .MuiButton-root": { minHeight: 44 } }}>
          <Button type="submit" variant="contained" disabled={busy || unavailable || !allowedFrequencies.includes(frequency) || (sendEmail && !emailAllowed)}>{busy && !deleting ? "Saving…" : "Save schedule"}</Button>
          {schedule && <Button type="button" color="error" onClick={() => { setDeleteError(null); setConfirmDelete(true); }} disabled={busy}>Delete schedule</Button>}
          <Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        </Stack>
      </Stack>
      <Dialog open={confirmDelete} onClose={() => { if (!busy) setConfirmDelete(false); }}
        aria-labelledby={`${id}-delete-title`} aria-describedby={`${id}-delete-description`}>
        <DialogTitle id={`${id}-delete-title`}>Delete this schedule?</DialogTitle>
        <DialogContent>
          <DialogContentText id={`${id}-delete-description`}>This removes the saved schedule. Your digest and existing runs will be kept. A run already in progress will continue.</DialogContentText>
          {deleteError && <Alert severity="error" role="alert" ref={deleteErrorRef} tabIndex={-1} sx={{ mt: 2, ...focusStyle }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="button" autoFocus onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
          <Button type="button" color="error" variant="contained" onClick={() => void deleteSchedule()} disabled={busy}>{deleting ? "Deleting…" : "Delete schedule"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function DigestScheduleControl({ digestId, schedule, exhausted, onSaved, runButton, access }: {
  access: AccessState;
  runButton: ReactNode;
  exhausted: boolean;
  digestId: string;
  schedule: DigestSchedule | null;
  onSaved: (digest: Digest | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const editRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) { restoreFocus.current = false; editRef.current?.focus(); }
  }, [editing]);
  function finishEditing() { restoreFocus.current = true; setEditing(false); }
  function editSchedule() { setNotice(""); setEditing(true); }
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1.5} alignItems="stretch" useFlexGap flexWrap="wrap"
        sx={{ "& > .MuiButton-root": { minHeight: 44, maxWidth: "100%", whiteSpace: "normal" } }}>
        {runButton}
        <Button ref={editRef} variant="outlined" startIcon={<ScheduleRoundedIcon />} onClick={editSchedule}
          disabled={editing || (!schedule && (!access.data?.schedule_allowed || !!access.error))}
          aria-describedby={!access.data?.schedule_allowed || access.error ? "digest-allowance-notice" : undefined}
          aria-expanded={editing} aria-controls={editing ? `schedule-form-${digestId}` : undefined}>
          {schedule ? "Update schedule" : "Schedule runs"}
        </Button>
      </Stack>
      <Box role="status" aria-live="polite" aria-atomic="true">
        {notice && <Typography variant="body2" sx={{ mt: 1.5 }}>{notice}</Typography>}
      </Box>
      {!editing && !schedule && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        No schedule is saved. Manual runs remain separate.
        {access.data?.plan && <> Included frequencies: {access.data.plan.configuration.schedule_frequencies.map(frequencyLabel).join(", ") || "none"}.
          Email delivery: {access.data.plan.configuration.email_delivery ? "included" : "not included"}.</>}
      </Typography>}
      {!editing && schedule && <Box sx={{ mt: 2 }}>
        <ScheduleOutlook key={`${digestId}:${JSON.stringify(schedule)}`} digestId={digestId} schedule={schedule} exhausted={exhausted} onEdit={editSchedule} />
      </Box>}
      {editing && <ScheduleForm access={access} digestId={digestId} schedule={schedule} onCancel={finishEditing} onSaved={(saved) => {
        onSaved(saved);
        setNotice(saved ? "Schedule saved. Check the planned start and current status below." : "Schedule deleted. Your digest and existing runs are retained; any run already in progress continues.");
        finishEditing();
      }} />}
    </Box>
  );
}
