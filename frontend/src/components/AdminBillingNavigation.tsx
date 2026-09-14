import { Button, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
export function AdminBillingNavigation({
  current,
  userId,
  email,
}: {
  current: "access" | "observation" | "sync";
  userId?: string | null;
  email?: string | null;
}) {
  const query = userId ? `?${new URLSearchParams({ user_id: userId })}` : "";
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
          to={
            userId
              ? `/admin/users/${encodeURIComponent(userId)}`
              : "/admin/users"
          }
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
