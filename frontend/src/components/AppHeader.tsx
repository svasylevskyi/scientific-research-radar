import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";
import { AppBar, Avatar, Box, Container, Toolbar } from "@mui/material";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { StripeModeBadge } from "./StripeModeBadge";
import { Brand } from "./Brand";
import { MainMenuLink } from "./MainMenuLink";
import { ResponsiveMainMenu, type MainMenuItem } from "./ResponsiveMainMenu";

export function AppHeader() {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initials = user?.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const avatar = (
    <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.dark", fontSize: "0.85rem", fontWeight: 800 }}>
      {initials}
    </Avatar>
  );
  const items: MainMenuItem[] = [
    { label: "Workspace", to: "/radar", icon: <ManageSearchRoundedIcon /> },
    { label: "Subscription and usage", shortLabel: "Subscription", to: "/radar/subscription", icon: <AutoStoriesRoundedIcon /> },
    { label: "Contact", to: "/radar/contact", icon: <MailOutlineRoundedIcon /> },
  ];
  const adminItems: MainMenuItem[] = [
    ...(user?.role === "admin" ? [
      { label: "Users", to: "/admin/users", icon: <AdminPanelSettingsRoundedIcon /> },
      { label: "Digests", to: "/admin/digests", icon: <LibraryBooksRoundedIcon /> },
      { label: "Plans", to: "/admin/subscription-plans", icon: <SubscriptionsRoundedIcon /> },
    ] : []),
    ...(user?.is_super_admin ? [{ label: "Pricing", to: "/admin/pricing", icon: <PaymentsRoundedIcon /> }] : []),
    ...(user?.role === "admin" ? [{ label: "Messages", to: "/admin/messages", icon: <MailOutlineRoundedIcon /> }] : []),
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
            profileMenu={{ icon: avatar, fullName: user?.full_name ?? "", items: [
              { label: "Profile", to: "/radar/profile", icon: <PersonRoundedIcon />, mobileLabel: user?.full_name, mobileIcon: avatar },
              { label: "Sign out", icon: <LogoutRoundedIcon />, disabled: isSigningOut, onClick: () => void handleLogout() },
            ] }} />
        </Container>
      </Toolbar>
    </AppBar>
  );
}
