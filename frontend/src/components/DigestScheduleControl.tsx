import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { digestsApi } from "../api/digests";
import type { DigestFrequency, DigestSchedule } from "../types/digest";

const frequencies: DigestFrequency[] = ["daily", "weekly", "monthly", "quarterly"];
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function localInput(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function describeDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function ScheduleForm({ digestId, schedule, onSaved, onCancel }: {
  digestId: string;
  schedule: DigestSchedule | null;
  onSaved: (schedule: DigestSchedule) => void;
  onCancel: () => void;
}) {
  const [frequency, setFrequency] = useState<DigestFrequency>(schedule?.frequency ?? "weekly");
  const [startsAt, setStartsAt] = useState(() => localInput(schedule ? new Date(schedule.starts_at) : new Date(Date.now() + 86400000)));
  const [endsAt, setEndsAt] = useState(() => schedule?.ends_at ? localInput(new Date(schedule.ends_at)) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    // Date can silently normalize a nonexistent local time during a DST change.
    if (!Number.isFinite(start.getTime()) || localInput(start) !== startsAt ||
        (end && (!Number.isFinite(end.getTime()) || localInput(end) !== endsAt))) {
      setError("Choose valid dates and times in your time zone."); return;
    }
    if (end && end <= start) {
      setError("Schedule end must be after the first digest date and time."); return;
    }
    setBusy(true);
    try {
      const saved = await digestsApi.saveSchedule(digestId, {
        frequency, starts_at: start.toISOString(), ends_at: end?.toISOString() ?? null, time_zone: timeZone,
      });
      onSaved(saved.schedule!);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the schedule. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Box component="form" id={`schedule-form-${digestId}`} onSubmit={save} sx={{ mt: 2 }}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">All dates and times below use {timeZone}. Saving stores preferences only; automatic runs are not enabled.</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select label="Digest frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as DigestFrequency)} required disabled={busy} fullWidth>
          {frequencies.map((value) => <MenuItem key={value} value={value}>{label(value)}</MenuItem>)}
        </TextField>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="First digest date and time" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required disabled={busy} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="End date and time (optional)" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={busy} fullWidth helperText="Exclusive cutoff. Leave empty for no end date." slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? "Saving…" : "Save schedule"}</Button>
          <Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export function DigestScheduleControl({ digestId, schedule, onSaved }: {
  digestId: string;
  schedule: DigestSchedule | null;
  onSaved: (schedule: DigestSchedule) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <Button variant="outlined" startIcon={<ScheduleRoundedIcon />} onClick={() => setEditing(true)} disabled={editing}
          aria-expanded={editing} aria-controls={editing ? `schedule-form-${digestId}` : undefined} sx={{ flexShrink: 0 }}>
          {schedule ? "Update schedule" : "Schedule runs"}
        </Button>
        {!editing && (schedule ? <Box>
          <Typography variant="body2" fontWeight={700}>{label(schedule.frequency)} · Saved preview</Typography>
          <Typography variant="body2" color="text.secondary">
            First digest: {describeDate(schedule.starts_at, schedule.time_zone)}. {schedule.ends_at ? `Stop before: ${describeDate(schedule.ends_at, schedule.time_zone)}.` : "No end date."} Time zone: {schedule.time_zone}.
          </Typography>
          <Typography variant="caption" color="text.secondary">Automatic runs are not enabled.</Typography>
        </Box> : <Typography variant="body2" color="text.secondary">Preview only — save a schedule without starting automatic runs.</Typography>)}
      </Stack>
      {editing && <ScheduleForm digestId={digestId} schedule={schedule} onCancel={() => setEditing(false)} onSaved={(saved) => { onSaved(saved); setEditing(false); }} />}
    </Box>
  );
}
