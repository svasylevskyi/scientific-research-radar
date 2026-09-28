import { Alert, Button } from "@mui/material";
import { useEffect, useState } from "react";

type Props = { error: string; retryAt?: number; retrying?: boolean; data?: unknown;
  refresh: () => Promise<unknown> | void };

/** A delayed read is informational; loaded content stays available below it. */
export function ResourceNotice({ error, retryAt = 0, retrying = false, data, refresh }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  if (!error) return null;
  const waiting = retryAt > now;
  return <Alert severity={retryAt ? "info" : "warning"} role="status" sx={{ mb: 2 }}
    action={<Button disabled={waiting} onClick={() => void refresh()}>Retry</Button>}>
    {error}{" "}{!!data && "Showing the last complete update. "}
    {waiting && `Retry available after ${new Date(retryAt).toLocaleTimeString()}. `}
    {retryAt > 0 && (retrying ? "Retrying automatically when available." : "Automatic retries are paused. Please retry when available.")}
  </Alert>;
}
