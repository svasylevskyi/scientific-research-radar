import { Button } from "@mui/material";
import { useSubscriptionAccess } from "../hooks/useSubscriptionAccess";
import { AllowanceNotice } from "./AllowanceNotice";
export function RetryRunButton({ digestId, runId, disabled, onRetry }: {
  digestId: string; runId: string; disabled?: boolean; onRetry: () => void;
}) {
  const access = useSubscriptionAccess(digestId, runId);
  return <>
    <AllowanceNotice {...access} reasons={access.data?.retry_reasons} />
    <Button disabled={disabled || !access.data?.retry_allowed || !!access.error} onClick={onRetry}>Retry failed stage</Button>
  </>;
}
