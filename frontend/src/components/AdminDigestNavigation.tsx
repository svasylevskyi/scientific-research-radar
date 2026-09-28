import { Button, Stack } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
export function AdminDigestNavigation({
  digestId,
  current,
}: {
  digestId: string;
  current: "details" | "runs";
}) {
  const { search } = useLocation();
  return (
    <Stack
      component="nav"
      aria-label="Digest administration"
      direction="row"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      sx={{ mb: 3 }}
    >
      <Button
        component={Link}
        to={`/admin/digests/${digestId}${search}`}
        variant={current === "details" ? "contained" : "text"}
        aria-current={current === "details" ? "page" : undefined}
      >
        Digest details
      </Button>
      <Button
        component={Link}
        to={`/admin/digests/${digestId}/runs${search}`}
        variant={current === "runs" ? "contained" : "text"}
        aria-current={current === "runs" ? "page" : undefined}
      >
        Research output & history
      </Button>
    </Stack>
  );
}
