import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import type { DigestRunDetail } from "../types/digest";

interface DigestRunFeedbackProps {
  run: DigestRunDetail;
  editable: boolean;
  isSaving?: boolean;
  onSave?: (feedback: string) => Promise<void>;
}

export function DigestRunFeedback({
  run,
  editable,
  isSaving = false,
  onSave,
}: DigestRunFeedbackProps) {
  const [feedback, setFeedback] = useState(run.feedback_text ?? "");

  useEffect(() => {
    setFeedback(run.feedback_text ?? "");
  }, [run.id, run.feedback_text]);

  return (
    <Stack spacing={2}>
      {editable && (
        <Alert severity="info">
          Your feedback helps future radar runs understand what is most useful for your
          continuing research on this topic. It can refine paper selection, emphasis,
          explanations, and recommended next steps.
        </Alert>
      )}

      {editable ? (
        <Paper
          component="form"
          variant="outlined"
          sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = feedback.trim();
            if (normalized && onSave) void onSave(normalized);
          }}
        >
          <Stack spacing={1.5}>
            <Typography variant="h6">
              {run.feedback_text ? "Update your feedback" : "Share your feedback"}
            </Typography>
            <TextField
              label="Feedback on this radar run"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              multiline
              minRows={5}
              inputProps={{ maxLength: 4000 }}
              helperText={`${4000 - feedback.length} characters remaining`}
              disabled={isSaving}
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isSaving || !feedback.trim() || feedback.trim() === (run.feedback_text ?? "")}
              sx={{ alignSelf: "flex-start" }}
            >
              {isSaving ? "Saving…" : run.feedback_text ? "Update feedback" : "Save feedback"}
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, borderRadius: 3 }}>
          {run.feedback_text ? (
            <>
              <Typography variant="h6" sx={{ mb: 1 }}>User feedback</Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{run.feedback_text}</Typography>
            </>
          ) : (
            <Typography color="text.secondary">No feedback was provided for this run.</Typography>
          )}
        </Paper>
      )}
    </Stack>
  );
}
