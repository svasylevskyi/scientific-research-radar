import { Button, Typography } from "@mui/material";
import { useId } from "react";
import { useSubscriptionAccess } from "../hooks/useSubscriptionAccess";
import { allowanceText } from "../allowancePresentation";
export function RetryRunButton({ digestId, runId, disabled, onRetry }: {
  digestId: string; runId: string; disabled?: boolean; onRetry: () => void;
}) {
  const access = useSubscriptionAccess(digestId, runId);
  const descriptionId = useId();
  const reasons = access.data?.retry_reasons ?? [];
  const explanation = access.error ? "Retry unavailable while allowances are being checked." : access.loading ? "Checking retry availability…" :
    !access.data?.retry_allowed ? (reasons.some(reason => reason.startsWith("Monthly"))
      ? "Retry unavailable with the current allowances."
      : [...new Set(reasons.map(allowanceText))].join(" ") || "This run cannot be retried.") : null;
  return <>
    <Button disabled={disabled || !access.data?.retry_allowed || !!access.error} aria-describedby={explanation ? descriptionId : undefined} onClick={onRetry}>Retry failed stage</Button>
    {explanation && <Typography id={descriptionId} variant="body2" color="text.secondary">{explanation}</Typography>}
  </>;
}
