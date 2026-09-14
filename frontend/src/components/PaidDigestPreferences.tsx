import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useSubscription } from "./SubscriptionData";
import { subscriptionsApi } from "../api/subscriptions";
export function PaidDigestPreferences() {
  const { activeDigests: data, busy, perform } = useSubscription();
  const [ids, setIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!dirty) setIds(data.selected_ids);
  }, [data, dirty]);
  if (!data.available) return null;
  if (data.items.length <= data.limit)
    return (
      <Alert severity="info">
        All {data.items.length} saved digests fit within your current paid
        plan’s {data.limit} slots.
      </Alert>
    );
  async function save() {
    if (busy) return;
    setError("");
    setSaved(false);
    try {
      await perform(() => subscriptionsApi.saveActiveDigests(ids));
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save active digests.",
      );
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1}>
        <Typography variant="h6">Active digests on your paid plan</Typography>
        <Typography>
          Choose {data.limit}. Other digests and their research remain available
          to read and edit.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">Active digests saved.</Alert>}
        {data.items.map((d) => (
          <FormControlLabel
            key={d.id}
            label={d.topic}
            control={
              <Checkbox
                checked={ids.includes(d.id)}
                disabled={
                  busy || (!ids.includes(d.id) && ids.length >= data.limit)
                }
                onChange={() => {
                  setDirty(true);
                  setSaved(false);
                  setIds((old) =>
                    old.includes(d.id)
                      ? old.filter((id) => id !== d.id)
                      : [...old, d.id],
                  );
                }}
              />
            }
          />
        ))}
        <Button
          disabled={
            busy ||
            !dirty ||
            ids.length !== Math.min(data.limit, data.items.length)
          }
          onClick={() => void save()}
        >
          Save active digests
        </Button>
      </Stack>
    </Paper>
  );
}
