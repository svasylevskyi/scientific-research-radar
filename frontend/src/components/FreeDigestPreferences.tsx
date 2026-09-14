import { subscriptionsApi } from "../api/subscriptions";
import { useSubscription } from "./SubscriptionData";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ApiError } from "../api/client";

export function FreeDigestPreferences() {
  const { freeDigests: data, busy, perform, refresh } = useSubscription();
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) setSelected(data.selected_ids);
  }, [data, dirty]);
  async function save() {
    if (busy) return;
    setError("");
    setMessage("");
    try {
      const result = await perform(() =>
        subscriptionsApi.saveFreeDigests(selected),
      );
      setDirty(false);
      setSelected(result.selected_ids);
      setMessage("Free digest preferences saved. Usage has not been reset.");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not save preferences.",
      );
    }
  }
  if (data && !data.available) return null;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1}>
        <Typography variant="h6">Digests to keep active on Free</Typography>
        {error && (
          <Alert severity="error">
            {error}
            <Button onClick={() => void refresh()}>Reload</Button>
          </Alert>
        )}
        {message && <Alert severity="success">{message}</Alert>}
        {data && (
          <>
            <Typography>
              {data.effective
                ? "Free is active."
                : "These preferences apply when paid access ends."}{" "}
              Choose up to {data.limit} digest(s). Others remain saved and
              readable, with new research inactive. If you have not chosen, the
              most recently used digests are selected.
            </Typography>
            {data.items.map((item) => (
              <Stack
                key={item.id}
                direction="row"
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
              >
                <FormControlLabel
                  label={item.topic}
                  control={
                    <Checkbox
                      checked={selected.includes(item.id)}
                      disabled={
                        busy ||
                        (!selected.includes(item.id) &&
                          selected.length >= data.limit)
                      }
                      onChange={(e) => {
                        setDirty(true);
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, item.id]
                            : ids.filter((id) => id !== item.id),
                        );
                      }}
                    />
                  }
                />
                <Button component={Link} to={`/digests/${item.id}`}>
                  Open digest
                </Button>
                {item.schedule_paused && (
                  <Typography variant="body2">
                    Schedule paused. Review and save it after upgrading to
                    resume future runs.
                  </Typography>
                )}
              </Stack>
            ))}
            {!data.items.length && (
              <Typography>No saved digests yet.</Typography>
            )}
            <Typography variant="body2">
              Changing this selection does not reset allowances. Scheduled runs
              and emails that your plan no longer includes are paused; already
              accepted work can finish.
            </Typography>
            <Button
              sx={{ alignSelf: "flex-start" }}
              disabled={
                busy ||
                selected.length !== Math.min(data.limit, data.items.length)
              }
              onClick={() => void save()}
            >
              Save Free preferences
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
