import { Alert, Button, Stack } from "@mui/material";
import { Link } from "react-router-dom";
import type { SubscriptionAccess } from "../hooks/useSubscriptionAccess";
export function AllowanceNotice({ data, error, loading, reasons = [], showResearchWarning = false, admin = false }: {
  data: SubscriptionAccess | null; error?: string | null; loading?: boolean; reasons?: string[]; showResearchWarning?: boolean; admin?: boolean;
}) {
  return <Stack spacing={1} sx={{ my: 2 }}>
    {loading && <Alert severity="info" role="status">Checking subscription allowances…</Alert>}
    {error && <Alert severity="warning">Could not refresh subscription allowances. {error} Allowance-dependent actions are paused until the check succeeds.</Alert>}
    {reasons.length > 0 && <Alert severity="warning">{reasons.join(" ")}
      {!admin && <Button component={Link} to="/subscription#upgrade" size="small">{data?.allowed ? "Upgrade options" : "Review subscription"}</Button>}
    </Alert>}
    {showResearchWarning && data?.research_warning && <Alert severity="info">{data.research_warning}
      {!admin && <Button component={Link} to="/subscription#upgrade" size="small">Upgrade options</Button>}
    </Alert>}
  </Stack>;
}
