import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import { Chip } from "@mui/material";

import type { User } from "../types/auth";

export function UserRoleChip({ user }: { user: User }) {
  if (user.is_super_admin) {
    return (
      <Chip
        size="small"
        color="secondary"
        icon={<AdminPanelSettingsRoundedIcon />}
        label="Super-admin"
      />
    );
  }
  return (
    <Chip
      size="small"
      variant={user.role === "admin" ? "filled" : "outlined"}
      color={user.role === "admin" ? "primary" : "default"}
      icon={user.role === "admin" ? <AdminPanelSettingsRoundedIcon /> : <PersonRoundedIcon />}
      label={user.role === "admin" ? "Admin" : "User"}
    />
  );
}
