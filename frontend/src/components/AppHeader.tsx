import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { AppBar, Avatar, Box, Button, Container, IconButton, Stack, Toolbar, Tooltip } from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";

export function AppHeader() {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initials = user?.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  async function handleLogout() {
    setIsSigningOut(true);
    await logout();
  }

  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
      <Toolbar sx={{ minHeight: { xs: 68, sm: 76 } }}>
        <Container maxWidth="lg" disableGutters sx={{ display: "flex", alignItems: "center" }}>
          <Box
            component={RouterLink}
            to="/"
            aria-label="Scientific Research Radar home"
            sx={{ color: "inherit", textDecoration: "none" }}
          >
            <Brand compact />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center">
            <Tooltip title="Workspace">
              <Button component={RouterLink} to="/" color="inherit" aria-label="Workspace" sx={{ minWidth: 44 }}>
                <HomeRoundedIcon />
                <Box component="span" sx={{ ml: 1, display: { xs: "none", md: "inline" } }}>Workspace</Box>
              </Button>
            </Tooltip>
            {user?.role === "admin" && (
              <Tooltip title="User administration">
                <Button component={RouterLink} to="/admin/users" color="inherit" aria-label="User administration" sx={{ minWidth: 44 }}>
                  <AdminPanelSettingsRoundedIcon />
                  <Box component="span" sx={{ ml: 1, display: { xs: "none", md: "inline" } }}>Users</Box>
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Profile">
              <IconButton component={RouterLink} to="/profile" aria-label="Profile" sx={{ ml: { xs: 0.5, sm: 1 }, p: 0.5 }}>
                <Avatar sx={{ width: 38, height: 38, bgcolor: "primary.dark", fontSize: "0.85rem", fontWeight: 800 }}>
                  {initials}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Tooltip title="Sign out">
              <Button color="inherit" onClick={handleLogout} disabled={isSigningOut} aria-label="Sign out" sx={{ minWidth: 44 }}>
                <LogoutRoundedIcon />
                <Box component="span" sx={{ ml: 1, display: { xs: "none", sm: "inline" } }}>Sign out</Box>
              </Button>
            </Tooltip>
          </Stack>
        </Container>
      </Toolbar>
    </AppBar>
  );
}
