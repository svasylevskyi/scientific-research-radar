import {
  createContext,
  useContext,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Alert, Button, Typography } from "@mui/material";
import {
  loadSubscription,
  type SubscriptionSnapshot,
} from "../api/subscriptions";
import { usePollingResource } from "../hooks/usePollingResource";

type Value = SubscriptionSnapshot & {
  busy: boolean;
  refresh: () => Promise<void>;
  perform: <T>(action: () => Promise<T>) => Promise<T>;
};
const Context = createContext<Value | null>(null);
export function SubscriptionData({ children }: PropsWithChildren) {
  const resource = usePollingResource(loadSubscription);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function perform<T>(action: () => Promise<T>): Promise<T> {
    if (locked.current || resource.error)
      throw new Error("Refresh subscription details before trying again.");
    locked.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      // Even an ambiguous failed write needs new server observations.
      await resource.refresh();
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {resource.error && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button disabled={busy} onClick={() => void resource.refresh()}>
              Retry
            </Button>
          }
        >
          Could not refresh subscription details. {resource.error}{" "}
          {resource.data &&
            "Showing the last complete update. Actions are paused until refresh succeeds."}
        </Alert>
      )}
      {resource.loading && (
        <Typography role="status">Loading subscription…</Typography>
      )}
      {resource.data && (
        <Context.Provider
          value={{
            ...resource.data,
            busy: busy || !!resource.error,
            refresh: resource.refresh,
            perform,
          }}
        >
          {children}
        </Context.Provider>
      )}
    </>
  );
}
export function useSubscription() {
  const value = useContext(Context);
  if (!value)
    throw new Error("Subscription controls require SubscriptionData.");
  return value;
}
