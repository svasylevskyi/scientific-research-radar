import { usePollingResource } from "../hooks/usePollingResource";
import { useCallback } from "react";
import { Chip, Tooltip } from "@mui/material";
import { apiRequest } from "../api/client";
import type { components } from "../types/api.generated";

type Mode = components["schemas"]["StripeModeRead"];

/** Read-only deployment status, visible to both admin roles. */
export function StripeModeBadge() {
  const load = useCallback((signal: AbortSignal) => apiRequest<Mode>("/admin/subscription-testing/mode", { signal }), []);
  const resource = usePollingResource(load, 60000);
  const mode = resource.data;
  const failed = !!resource.error;
  const label = mode ? `Stripe: ${mode.mode === "live" ? "Live" : "Sandbox"}` : failed ? "Stripe: unavailable" : "Stripe: loading";
  return <Tooltip title={mode ? `Deployment configuration. Checkout ${mode.checkout_enabled ? "enabled" : "disabled"}.` : "Could not yet verify the configured Stripe mode."}>
    <Chip size="small" label={label} color={mode?.mode === "live" ? "warning" : "default"} variant="outlined" sx={{ mx: 1 }} />
  </Tooltip>;
}
