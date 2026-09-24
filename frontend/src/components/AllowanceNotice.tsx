import { Alert, Button, Box } from "@mui/material";
import { Link } from "react-router-dom";
import type { SubscriptionAccess } from "../hooks/useSubscriptionAccess";
import { allowanceMessage, type AllowanceContext } from "../allowancePresentation";

/** One page-owned notice; loading and errors take precedence over stale quotas. */
export function AllowanceNotice({ data, error, loading, context, id }: {
  data: SubscriptionAccess | null; error?: string | null; loading?: boolean;
  context: AllowanceContext; id?: string;
}) {
  const message = allowanceMessage(data, context);
  if (error) return <Alert id={id} severity="warning" sx={{ my: 2 }}>Could not refresh subscription allowances. Allowance-dependent actions are paused while we retry.</Alert>;
  if (loading) return <Alert id={id} severity="info" role="status" sx={{ my: 2 }}>Checking subscription allowances…</Alert>;
  if (!message) return null;
  return <Alert id={id} severity="info" sx={{ my: 2 }}>
    {message}
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
      <Button component={Link} to="/radar/subscription" size="small">Subscription and usage</Button>
      <Button component={Link} to="/radar/subscription#upgrade" size="small">Upgrade options</Button>
    </Box>
  </Alert>;
}
