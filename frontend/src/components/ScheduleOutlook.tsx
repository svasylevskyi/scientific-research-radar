import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Alert, Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { digestsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import { startPagePolling } from "../pagePolling";
import type { DigestSchedule, SchedulePreview } from "../types/digest";

function dateLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function ScheduleOutlook({ digestId, schedule, exhausted }: {
  digestId: string; schedule: DigestSchedule; exhausted: boolean;
}) {
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();
  useEffect(() => {
    let mounted = true;
    const stop = startPagePolling(async () => {
      try {
        const result = await digestsApi.schedulePreview(digestId);
        if (mounted) { setPreview(result); setError(false); }
      } catch { if (mounted) setError(true); }
    }, 5000);
    return () => { mounted = false; stop(); };
  }, [digestId]);

  const ended = preview?.exhausted ?? exhausted;
  const state = preview?.state;
  const timeZone = preview?.time_zone ?? schedule.time_zone;
  const planned = preview?.next_scheduled_at;
  const executing = state === "queued" || state === "running";
  const waiting = state === "due" || state === "waiting_for_run" || state === "waiting_for_allowance" || state === "waiting_for_subscription";
  const waitingLabels = {
    due: "Due — waiting to start",
    waiting_for_run: "Waiting for an active run to finish",
    waiting_for_subscription: "Waiting for subscription access",
    waiting_for_allowance: "Waiting for usage allowance",
  };

  if (state === "not_scheduled") return <Typography variant="body2">No schedule is saved.</Typography>;

  return <Stack spacing={1}>
    {error && <Alert severity="warning">Could not refresh schedule timing. Retrying automatically.
      {preview && ` Last checked: ${dateLabel(preview.as_of, timeZone)}.`}
    </Alert>}
    {executing && <Alert severity="info">
      {state === "queued" ? "Scheduled run queued — waiting to begin." : "Scheduled run in progress."}
      {preview?.active_run_id && <Button size="small" component={RouterLink}
        to={`/digests/${digestId}?run_id=${preview.active_run_id}`}>View progress</Button>}
    </Alert>}
    {waiting && <Alert severity="info">
      {waitingLabels[state as keyof typeof waitingLabels]}
      {planned && <Typography variant="body2">Planned for {dateLabel(planned, timeZone)}.</Typography>}
      {preview?.subscription_message && <Typography variant="body2">{preview.subscription_message}</Typography>}
      {state === "waiting_for_allowance" && preview?.allowance_available_at && <Typography variant="body2">
        Allowance available from {dateLabel(preview.allowance_available_at, timeZone)}. The actual start may be later.
        {schedule.ends_at && new Date(preview.allowance_available_at) >= new Date(schedule.ends_at)
          ? " The schedule ends before allowance returns. Extend it to allow another run." : ""}
      </Typography>}
    </Alert>}
    {ended ? <Alert severity="info">
      <Typography variant="body2" fontWeight={700}>No more runs are scheduled.</Typography>
      <Typography variant="body2">The next recurring date would reach or pass this schedule’s end date. Update or extend the schedule to continue automatic runs, or delete it. Any run already in progress will continue.</Typography>
    </Alert> : <>
      <Typography variant="body2" fontWeight={700}>
        {planned ? `${waiting ? "Next planned occurrence" : "Next scheduled run"}: ${dateLabel(planned, timeZone)}` : "Checking the next scheduled run…"}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)} · Time zone: {timeZone}.
        {schedule.ends_at ? ` Stops before ${dateLabel(schedule.ends_at, timeZone)}.` : " No end date."}
      </Typography>
      {preview && preview.upcoming_runs.length > 0 && <Box>
        <Button size="small" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
          aria-controls={`upcoming-${digestId}`} endIcon={<ExpandMoreRoundedIcon sx={{ transform: expanded ? "rotate(180deg)" : undefined }} />}>
          Upcoming runs ({preview.upcoming_runs.length})
        </Button>
        <Collapse in={expanded} id={`upcoming-${digestId}`}>
          <Box component="ol" sx={{ mt: 0.5, pl: 3 }}>
            {preview.upcoming_runs.map((date) => <Typography component="li" variant="body2" key={date}>
              {dateLabel(date, timeZone)}{new Date(date) <= new Date(preview.as_of) ? " — due" : ""}
            </Typography>)}
          </Box>
        </Collapse>
      </Box>}
      <Typography variant="caption" color="text.secondary">Planned start times, not guaranteed completion or email-delivery times.</Typography>
    </>}
    {(!ended || executing) && <Typography variant="caption" color="text.secondary">
      {(preview?.send_email ?? schedule.send_email) ? `Future scheduled briefings will be emailed to ${user?.email ?? "your profile address"}.` : "Email delivery is off for future scheduled runs."}
    </Typography>}
  </Stack>;
}
