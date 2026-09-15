import { useEffect, useState } from "react";
import { Chip, Tooltip } from "@mui/material";
import { apiRequest } from "../api/client";
import type { components } from "../types/api.generated";

type Mode = components["schemas"]["StripeModeRead"];

/** Read-only deployment status, visible to both admin roles. */
export function StripeModeBadge() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => apiRequest<Mode>("/admin/subscription-testing/mode")
      .then(value => { if (active) { setMode(value); setFailed(false); } })
      .catch(() => { if (active) { setMode(null); setFailed(true); } });
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const label = mode ? `Stripe: ${mode.mode === "live" ? "Live" : "Sandbox"}` : failed ? "Stripe: unavailable" : "Stripe: loading";
  return <Tooltip title={mode ? `Deployment configuration. Checkout ${mode.checkout_enabled ? "enabled" : "disabled"}.` : "Could not yet verify the configured Stripe mode."}>
    <Chip size="small" label={label} color={mode?.mode === "live" ? "warning" : "default"} variant="outlined" sx={{ mx: 1 }} />
  </Tooltip>;
}
