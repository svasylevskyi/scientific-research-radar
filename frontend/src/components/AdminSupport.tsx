import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, Chip, Pagination, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { closureLabels } from "../api/accountClosure";
import { listRange, safeSupportReturn, supportReturnLabel } from "../admin/support";
import type { User } from "../types/auth";

/** A common heading/toolbar, not a second admin layout or navigation system. */
export function AdminPageHeading({ title, description, icon, actions }: {
  title: ReactNode; description: ReactNode; icon?: ReactNode; actions?: ReactNode;
}) {
  return <Stack spacing={2.5} sx={{ mb: 3, minWidth: 0 }}>
    <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ mb: 0.75 }}>
        {icon && <Box sx={{ mt: 0.75, flexShrink: 0 }} aria-hidden="true">{icon}</Box>}
        <Typography component="h1" variant="h3" sx={{ minWidth: 0 }}>{title}</Typography>
      </Stack>
      <Typography color="text.secondary">{description}</Typography>
    </Box>
    {actions && <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="flex-start"
      sx={{ minWidth: 0, "& > *": { maxWidth: "100%" } }}>{actions}</Stack>}
  </Stack>;
}

export function AdminListFooter({ page, pageSize, total, count, noun, onChange }: {
  page: number; pageSize: number; total: number; count: number; noun: string; onChange: (page: number) => void;
}) {
  return <Stack spacing={1.5} alignItems="center" sx={{ mt: 3 }}>
    {total > pageSize && <Pagination aria-label={`${noun} pages`} count={Math.ceil(total / pageSize)} page={page}
      onChange={(_, value) => onChange(value)} color="primary" siblingCount={0} boundaryCount={1}
      sx={{ "& .MuiPagination-ul": { justifyContent: "center" } }} />}
    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
      {listRange(page, pageSize, total, count, noun)}
    </Typography>
  </Stack>;
}

export function AccountStatusChip({ user }: { user: User }) {
  return <Chip size="small" variant="outlined"
    label={user.closure_state ? closureLabels[user.closure_state] : user.is_active ? "Active" : "Inactive"}
    color={user.closure_state ? user.closure_state === "completed" ? "default" : "warning" : user.is_active ? "success" : "default"}
    sx={{ maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }} />;
}

export function AdminSupportReturn() {
  const [search] = useSearchParams();
  const path = safeSupportReturn(search.get("support_return"));
  return path ? <Button component={RouterLink} to={path} startIcon={<ArrowBackRoundedIcon />} color="inherit" sx={{ mb: 2 }}>
    {supportReturnLabel(path)}
  </Button> : null;
}
