import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import type {
  DigestRunDetail,
  DigestRunStage,
  DigestRunStageType,
} from "../types/digest";

const stageNames: Record<DigestRunStageType, string> = {
  discovery_relevance: "Discover and score papers",
  paper_summaries: "Summarize selected papers",
  trend_analysis: "Analyze research trends",
  digest_briefing: "Prepare digest briefing",
};

function statusIcon(stage: DigestRunStage) {
  if (stage.status === "completed") {
    return <CheckCircleRoundedIcon color="success" />;
  }
  if (stage.status === "failed") {
    return <ErrorRoundedIcon color="error" />;
  }
  if (stage.status === "running") {
    return <CircularProgress size={22} />;
  }
  return <RadioButtonUncheckedRoundedIcon color="disabled" />;
}

function resultSummary(run: DigestRunDetail, stage: DigestRunStage) {
  if (stage.status === "pending") return "Waiting for the preceding stage.";
  if (stage.status === "failed") {
    const partialProgress =
      stage.stage === "paper_summaries" && stage.progress_current > 0
        ? ` ${stage.progress_current} of ${stage.progress_total} paper summaries were saved before the failure.`
        : "";
    return `${stage.error_message ?? "This stage failed."}${partialProgress}`;
  }
  if (stage.status === "running") {
    if (stage.stage === "paper_summaries" && stage.progress_total > 0) {
      return `${stage.progress_current} of ${stage.progress_total} paper summaries saved.`;
    }
    return "OpenAI is processing this stage. You can leave this page safely.";
  }

  if (stage.stage === "discovery_relevance") {
    const sources = run.search_data?.sources_used ?? [];
    return run.paper_count === 0
      ? "The search completed without finding a qualifying paper."
      : `${run.paper_count} ${run.paper_count === 1 ? "paper" : "papers"} discovered and scored${
          sources.length ? ` across ${sources.join(", ")}` : ""
        }.`;
  }
  if (stage.stage === "paper_summaries") {
    const summaryCount = run.paper_results.filter((paper) => paper.summary_data).length;
    return `${summaryCount} ${summaryCount === 1 ? "paper summary" : "paper summaries"} saved.`;
  }
  if (stage.stage === "trend_analysis") {
    return run.trend_analysis?.overview ?? "Trend analysis completed.";
  }
  return run.briefing?.executive_summary ?? "Digest briefing completed.";
}

export function DigestRunProgress({ run }: { run: DigestRunDetail }) {
  const sortedStages = [...run.stages].sort((left, right) => left.position - right.position);

  return (
    <Stack spacing={1.25} aria-label="Radar run progress">
      <Typography variant="caption" color="text.secondary">
        OpenAI response jobs created: {run.request_count}. Paper-summary batches can make the total exceed four.
      </Typography>
      {sortedStages.map((stage) => (
        <Paper
          key={stage.stage}
          variant="outlined"
          sx={{
            p: 1.75,
            borderRadius: 2.5,
            borderColor: stage.status === "failed" ? "error.main" : undefined,
            bgcolor: stage.status === "running" ? "action.hover" : undefined,
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="flex-start">
            <Box sx={{ display: "flex", pt: 0.2 }}>{statusIcon(stage)}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography fontWeight={700}>{stageNames[stage.stage]}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                  {stage.status}
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                color={stage.status === "failed" ? "error.main" : "text.secondary"}
                sx={{ mt: 0.4 }}
              >
                {resultSummary(run, stage)}
              </Typography>
              {stage.status === "running" && stage.progress_total > 1 && (
                <LinearProgress
                  variant="determinate"
                  value={(stage.progress_current / stage.progress_total) * 100}
                  sx={{ mt: 1.25, borderRadius: 999 }}
                />
              )}
            </Box>
          </Stack>
        </Paper>
      ))}
      {run.status === "failed" && (
        <Alert severity="error" icon={<ErrorRoundedIcon />}>
          Completed stages and partial results remain available in run history.
        </Alert>
      )}
      {run.status === "running" && (
        <Alert severity="info" icon={<HourglassEmptyRoundedIcon />}>
          Only one radar run can be active for your account. Other application pages remain available.
        </Alert>
      )}
      {run.status === "queued" && (
        <Alert severity="info" icon={<HourglassEmptyRoundedIcon />}>
          This run is queued. A radar worker will start it shortly; other application pages remain available.
        </Alert>
      )}
    </Stack>
  );
}
