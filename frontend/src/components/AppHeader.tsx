import { AppBar, Box, Container, Toolbar } from "@mui/material";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { StripeModeBadge } from "./StripeModeBadge";
import { Brand } from "./Brand";
import { MainMenuLink } from "./MainMenuLink";
import { ResponsiveMainMenu, type MainMenuItem } from "./ResponsiveMainMenu";

export function AppHeader() {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const items: MainMenuItem[] = [
    { label: "Workspace", to: "/radar" },
    { label: "Subscription and usage", shortLabel: "Subscription", to: "/radar/subscription" },
    { label: "Contact", to: "/radar/contact" },
  ];
  const adminItems: MainMenuItem[] = [
    ...(user?.role === "admin" ? [
      { label: "Users", to: "/admin/users" },
      { label: "Digests", to: "/admin/digests" },
      { label: "Plans", to: "/admin/subscription-plans" },
    ] : []),
    ...(user?.is_super_admin ? [{ label: "Pricing", to: "/admin/pricing" }] : []),
    ...(user?.role === "admin" ? [{ label: "Messages", to: "/admin/messages" }] : []),
  ];

  async function handleLogout() {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <AppBar position="sticky" color="inherit" elevation={0}
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
      <Toolbar sx={{ minHeight: { xs: 68, sm: 76 } }}>
        <Container maxWidth="lg" disableGutters sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Box component={MainMenuLink} to="/" aria-label="Scientific Research Radar home"
            sx={{ color: "inherit", textDecoration: "none" }}>
            <Brand compact />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {(user?.role === "admin" || user?.is_super_admin) && (
            <Box sx={{
              order: { xs: 1, lg: 0 }, display: "flex", justifyContent: "flex-end",
              width: { xs: "100%", lg: "auto" }, pb: { xs: 1, lg: 0 },
            }}>
              <StripeModeBadge />
            </Box>
          )}
          <ResponsiveMainMenu label="Workspace navigation" items={items} adminItems={adminItems}
            accountItems={[
              { label: "Profile", to: "/radar/profile" },
              { label: "Sign out", disabled: isSigningOut, onClick: () => void handleLogout() },
            ]} />
        </Container>
      </Toolbar>
    </AppBar>
  );
}
