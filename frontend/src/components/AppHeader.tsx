import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  ListSubheader,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { StripeModeBadge } from "./StripeModeBadge";
import { Brand } from "./Brand";
import { navigationCurrent, pageNavigation } from "../navigation";
import { MainMenuLink, mainMenuItemSx } from "./MainMenuLink";

export function AppHeader() {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adminAnchor, setAdminAnchor] = useState<HTMLElement | null>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const location = useLocation();
  const current = (to: string) => navigationCurrent(location.pathname, to);
  const initials = user?.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const links = [
    {
      label: "Workspace",
      short: "Workspace",
      to: "/radar",
      icon: <HomeRoundedIcon />,
    },
    {
      label: "Subscription and usage",
      short: "Subscription",
      to: "/subscription",
      icon: <SubscriptionsRoundedIcon />,
    },
    {
      label: "Contact",
      short: "Contact",
      to: "/contact",
      icon: <MailOutlineRoundedIcon />,
    },
  ];
  const adminLinks = [
    ...(user?.role === "admin"
      ? [
          {
            label: "Users",
            short: "Users",
            to: "/admin/users",
            icon: <AdminPanelSettingsRoundedIcon />,
          },
          {
            label: "Digests",
            short: "Digests",
            to: "/admin/digests",
            icon: <LibraryBooksRoundedIcon />,
          },
          {
            label: "Plans",
            short: "Plans",
            to: "/admin/subscription-plans",
            icon: <SubscriptionsRoundedIcon />,
          },
        ]
      : []),
    ...(user?.is_super_admin
      ? [
          {
            label: "Pricing",
            short: "Pricing",
            to: "/admin/pricing",
            icon: <PaymentsRoundedIcon />,
          },
        ]
      : []),
  ];
  if (user?.role === "admin") adminLinks.push({ label: "Messages", short: "Messages", to: "/admin/messages", icon: <MailOutlineRoundedIcon /> });
  // Profile and sign-out are menu items too; collapse the entire menu, not overflow only.
  const collapsed = mobile && links.length + 2 > 3;
  const avatar = (
    <Avatar
      sx={{
        width: 32,
        height: 32,
        bgcolor: "primary.dark",
        fontSize: "0.85rem",
        fontWeight: 800,
      }}
    >
      {initials}
    </Avatar>
  );
  useEffect(() => {
    setAnchor(null);
    setAdminAnchor(null);
  }, [location.key, collapsed, user?.role, user?.is_super_admin]);

  async function handleLogout() {
    setAnchor(null);
    setAdminAnchor(null);
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: "1px solid", borderColor: "divider" }}
    >
      <Toolbar sx={{ minHeight: { xs: 68, sm: 76 } }}>
        <Container
          maxWidth="lg"
          disableGutters
          component="nav"
          aria-label="Workspace navigation"
          sx={{ display: "flex", alignItems: "center" }}
        >
          <Box
            component={MainMenuLink}
            to="/"
            aria-label="Scientific Research Radar home"
            sx={{ color: "inherit", textDecoration: "none" }}
          >
            <Brand compact />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {(user?.role === "admin" || user?.is_super_admin) && <StripeModeBadge />}
          {collapsed ? (
            <>
              <Tooltip title="Open navigation menu">
                <IconButton
                  color="inherit"
                  aria-label="Open navigation menu"
                  aria-controls={anchor ? "app-navigation-menu" : undefined}
                  aria-haspopup="true"
                  aria-expanded={!!anchor}
                  onClick={(event) => setAnchor(event.currentTarget)}
                >
                  <MenuRoundedIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="app-navigation-menu"
                anchorEl={anchor}
                open={!!anchor}
                onClose={() => setAnchor(null)}
                MenuListProps={{ "aria-label": "Navigation" }}
              >
                {links.map((link) => (
                  <MenuItem
                    key={link.to}
                    component={MainMenuLink}
                    to={link.to}
                    aria-current={current(link.to)}
                    selected={!!current(link.to)}
                    sx={mainMenuItemSx}
                    onClick={() => setAnchor(null)}
                  >
                    <ListItemIcon>{link.icon}</ListItemIcon>
                    <ListItemText>{link.label}</ListItemText>
                  </MenuItem>
                ))}
                {!!adminLinks.length && <Divider />}
                {!!adminLinks.length && (
                  <ListSubheader
                    disableSticky
                    sx={{
                      lineHeight: "32px",
                      fontSize: "0.75rem",
                      bgcolor: "transparent",
                    }}
                  >
                    Admin
                  </ListSubheader>
                )}
                {adminLinks.map((link) => (
                  <MenuItem
                    key={link.to}
                    component={MainMenuLink}
                    to={link.to}
                    aria-current={current(link.to)}
                    selected={!!current(link.to)}
                    sx={mainMenuItemSx}
                    onClick={() => setAnchor(null)}
                  >
                    <ListItemIcon>{link.icon}</ListItemIcon>
                    <ListItemText>{link.label}</ListItemText>
                  </MenuItem>
                ))}
                <MenuItem
                  component={MainMenuLink}
                  to="/profile"
                  aria-current={current("/profile")}
                  selected={!!current("/profile")}
                  sx={mainMenuItemSx}
                  onClick={() => setAnchor(null)}
                >
                  <ListItemIcon>{avatar}</ListItemIcon>
                  <ListItemText>Profile</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => void handleLogout()}
                  disabled={isSigningOut}
                >
                  <ListItemIcon>
                    <LogoutRoundedIcon />
                  </ListItemIcon>
                  <ListItemText>Sign out</ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Stack
              direction="row"
              spacing={{ xs: 0.5, sm: 1 }}
              alignItems="center"
            >
              {links.map((link) => (
                <Tooltip key={link.to} title={link.label}>
                  <Button
                    component={MainMenuLink}
                    to={link.to}
                    aria-current={current(link.to)}
                    color="inherit"
                    aria-label={link.label}
                    sx={{ minWidth: 44, ...mainMenuItemSx }}
                  >
                    {link.icon}
                    <Box
                      component="span"
                      sx={{ ml: 1, display: { xs: "none", lg: "inline" } }}
                    >
                      {link.short}
                    </Box>
                  </Button>
                </Tooltip>
              ))}
              {!!adminLinks.length && (
                <>
                  <Button
                    id="admin-menu-button"
                    aria-current={pageNavigation(location.pathname).admin ? "location" : undefined}
                    sx={mainMenuItemSx}
                    color="inherit"
                    startIcon={<AdminPanelSettingsRoundedIcon />}
                    endIcon={<ExpandMoreRoundedIcon />}
                    aria-controls={
                      adminAnchor ? "admin-navigation-menu" : undefined
                    }
                    aria-haspopup="true"
                    aria-expanded={!!adminAnchor}
                    onClick={(event) => setAdminAnchor(event.currentTarget)}
                  >
                    Admin
                  </Button>
                  <Menu
                    id="admin-navigation-menu"
                    anchorEl={adminAnchor}
                    open={!!adminAnchor}
                    onClose={() => setAdminAnchor(null)}
                    MenuListProps={{ "aria-labelledby": "admin-menu-button" }}
                  >
                    {adminLinks.map((link) => (
                      <MenuItem
                        key={link.to}
                        component={MainMenuLink}
                        to={link.to}
                        aria-current={current(link.to)}
                        selected={!!current(link.to)}
                        sx={mainMenuItemSx}
                        onClick={() => setAdminAnchor(null)}
                      >
                        <ListItemIcon>{link.icon}</ListItemIcon>
                        <ListItemText>{link.label}</ListItemText>
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
              <Tooltip title="Profile">
                <IconButton
                  component={MainMenuLink}
                  to="/profile"
                  aria-current={current("/profile")}
                  aria-label="Profile"
                  sx={{ p: 0.5, ...mainMenuItemSx }}
                >
                  {avatar}
                </IconButton>
              </Tooltip>
              <Tooltip title="Sign out">
                <Button
                  color="inherit"
                  onClick={() => void handleLogout()}
                  disabled={isSigningOut}
                  aria-label="Sign out"
                  sx={{ minWidth: 44 }}
                >
                  <LogoutRoundedIcon />
                  <Box
                    component="span"
                    sx={{ ml: 1, display: { xs: "none", lg: "inline" } }}
                  >
                    Sign out
                  </Box>
                </Button>
              </Tooltip>
            </Stack>
          )}
        </Container>
      </Toolbar>
    </AppBar>
  );
}
