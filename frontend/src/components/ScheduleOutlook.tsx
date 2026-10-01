import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Alert, Box, Button, Chip, Collapse, Paper, Stack, Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { digestsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import { usePollingResource } from "../hooks/usePollingResource";
import { ResourceNotice } from "./ResourceNotice";
import type { DigestSchedule } from "../types/digest";
import { frequencyLabel, scheduleDateLabel, scheduleProgressPath, scheduleStateLabel } from "../schedulePresentation";

export function ScheduleOutlook({ digestId, schedule, exhausted, onEdit }: {
  digestId: string; schedule: DigestSchedule; exhausted: boolean; onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useAuth();
  const load = useCallback((signal: AbortSignal) => digestsApi.schedulePreview(digestId, signal), [digestId]);
  const resource = usePollingResource(load, 10000);
  const preview = resource.data;
  const stale = !!resource.error && !!preview;
  const state = preview?.state;
  const ended = preview?.exhausted ?? exhausted;
  const timeZone = preview?.time_zone ?? schedule.time_zone;
  const planned = preview?.next_scheduled_at;
  const executing = state === "queued" || state === "running";
  const progressPath = preview ? scheduleProgressPath(digestId, preview) : null;
  const label = preview ? `${stale ? "Last known: " : ""}${scheduleStateLabel(state)}`
    : resource.error ? "Status unavailable" : "Checking schedule…";
  const needsReview = state === "waiting_for_subscription";
  const allowanceReturnsTooLate = !!(preview?.allowance_available_at && schedule.ends_at &&
    new Date(preview.allowance_available_at) >= new Date(schedule.ends_at));

  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, minWidth: 0, overflowWrap: "anywhere" }}>
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
        <Typography component="h3" variant="h6">Saved schedule</Typography>
        {/* Only the compact state is live. Poll timestamps and the whole card are not announced. */}
        <Box role="status" aria-live="polite" aria-atomic="true">
          <Chip variant="outlined" label={label} color={resource.error || needsReview ? "warning" : executing ? "info" : "default"}
            sx={{ height: "auto", maxWidth: "100%", "& .MuiChip-label": { py: 0.5, whiteSpace: "normal" } }} />
        </Box>
      </Stack>
      <ResourceNotice {...resource} />
      {stale && <Typography variant="body2" color="text.secondary">Showing the last reported schedule. Its current status and planned time could not be confirmed.</Typography>}
      {state === "not_scheduled" ? <Typography>No schedule is saved{stale ? " in the last report" : ""}.</Typography> : <>
        <Box>
          <Typography variant="body2" color="text.secondary">{stale ? "Last reported planned start" : "Next planned start"}</Typography>
          <Typography variant="h6" component="p">
            {ended ? "No more runs scheduled" : planned ? scheduleDateLabel(planned, timeZone)
              : resource.error ? "Not available" : !preview ? "Checking the next planned start…" : "No start time is currently available"}
          </Typography>
        </Box>
        {executing && <Typography variant="body2">
          {state === "queued" ? "A scheduled run is queued and waiting to begin." : "A scheduled run is in progress."}
          {ended && " It continues even though there are no future occurrences."}
        </Typography>}
        {state === "due" && <Typography variant="body2">This occurrence is due but has not started. A planned time does not confirm that research is queued.</Typography>}
        {state === "waiting_for_run" && <Typography variant="body2">Waiting for an active run to finish. Only one research run can be active for your account.</Typography>}
        {state === "waiting_for_allowance" && <Typography variant="body2">
          Waiting for usage allowance.
          {preview?.allowance_available_at && <> Allowance available from {scheduleDateLabel(preview.allowance_available_at, timeZone)}. The actual start may be later.</>}
          {allowanceReturnsTooLate && " The schedule ends before allowance returns. Extend it to allow another run."}
        </Typography>}
        {needsReview && <Alert severity="warning" role="note">
          <Typography variant="body2">{preview?.subscription_message || "Review subscription access and this schedule’s settings before expecting another run."}</Typography>
        </Alert>}
        {ended && <Typography variant="body2">The schedule has no further occurrences. Update or extend it to continue automatic runs, or delete it. Any run already in progress will continue.</Typography>}
        <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 2 }}>
          {[
            ["Frequency", frequencyLabel(schedule.frequency)],
            ["Time zone", timeZone || "Not recorded"],
            ["End date", schedule.ends_at ? `Stops before ${scheduleDateLabel(schedule.ends_at, timeZone)}` : "No end date"],
            // This is the saved preference, not proof that a paused schedule will send email.
            ["Email preference", schedule.send_email ? `On — ${user?.email ?? "your profile address"}` : "Off — view results in Radar"],
          ].map(([title, value]) => <Box key={title} sx={{ minWidth: 0 }}>
            <Typography component="dt" variant="body2" color="text.secondary">{title}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>{value}</Typography>
          </Box>)}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ "& > .MuiButton-root": { minHeight: 44, whiteSpace: "normal" } }}>
          {progressPath && <Button size="small" component={RouterLink} to={progressPath}>{executing ? "View progress" : "Open active digest"}</Button>}
          {state === "waiting_for_allowance" && <Button size="small" component={RouterLink} to="/radar/subscription">Review usage</Button>}
          {needsReview && <Button size="small" component={RouterLink} to="/radar/subscription">Review subscription</Button>}
          {(ended || needsReview || allowanceReturnsTooLate) && onEdit && <Button size="small" onClick={onEdit}>Review schedule</Button>}
          {!ended && preview && preview.upcoming_runs.length > 0 && <Button size="small" onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded} aria-controls={`upcoming-${digestId}`} endIcon={<ExpandMoreRoundedIcon sx={{ transform: expanded ? "rotate(180deg)" : undefined }} />}>
            Upcoming runs ({preview.upcoming_runs.length})
          </Button>}
        </Stack>
        {!ended && preview && preview.upcoming_runs.length > 0 && <Collapse in={expanded} id={`upcoming-${digestId}`}>
          <Box component="ol" sx={{ my: 0.5, pl: 3 }}>
            {preview.upcoming_runs.map((date) => <Typography component="li" variant="body2" key={date}>
              {scheduleDateLabel(date, timeZone)}{new Date(date) <= new Date(preview.as_of) ? " — due" : ""}
            </Typography>)}
          </Box>
        </Collapse>}
        <Typography variant="caption" color="text.secondary">Planned start times are not guaranteed completion or email-delivery times. Email follows completed scheduled research when delivery is enabled and permitted.</Typography>
      </>}
    </Stack>
  </Paper>;
}
