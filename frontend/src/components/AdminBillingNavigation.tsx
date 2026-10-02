import { Button, Paper, Stack, Typography } from "@mui/material";
import { Link, useSearchParams } from "react-router-dom";
import { safeSupportReturn } from "../admin/support";
export function AdminBillingNavigation({
  current,
  userId,
  email,
}: {
  current: "access" | "observation" | "sync";
  userId?: string | null;
  email?: string | null;
}) {
  const [search] = useSearchParams();
  const candidate = safeSupportReturn(search.get("support_return"));
  // Do not point a newly selected account back to a different user's details.
  const origin = userId && candidate?.split("?")[0] === `/admin/users/${encodeURIComponent(userId)}` ? candidate : null;
  const params = new URLSearchParams(userId ? { user_id: userId } : {});
  if (origin) params.set("support_return", origin);
  const query = params.size ? `?${params}` : "";
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, overflowWrap: "anywhere" }}>
      <Typography variant="overline">
        {userId ? "Selected account" : "Billing administration"}
      </Typography>
      <Typography>
        {email || (userId ? `User ${userId}` : "All accessible users")}
      </Typography>
      <Stack
        component="nav"
        aria-label="Billing administration"
        direction="row"
        useFlexGap
        flexWrap="wrap"
        spacing={1}
        sx={{ mt: 1 }}
      >
        <Button
          component={Link}
          to={origin ?? (userId ? `/admin/users/${encodeURIComponent(userId)}` : "/admin/users")}
        >
          {userId ? "User details" : "Users"}
        </Button>
        {(
          [
            ["access", "/admin/subscription-access", "Access"],
            ["observation", "/admin/subscription-observation", "Observation"],
            ["sync", "/admin/billing-sync", "Synchronization"],
          ] as const
        ).map(([key, path, label]) => (
          <Button
            key={key}
            component={Link}
            to={path + query}
            variant={current === key ? "contained" : "text"}
            aria-current={current === key ? "page" : undefined}
          >
            {label}
          </Button>
        ))}
        <Button component={Link} to="/admin/subscription-plans">
          Plans
        </Button>
      </Stack>
    </Paper>
  );
}
