import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import {
  Box, Button, Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Stack,
  Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { navigationCurrent, pageNavigation } from "../navigation";
import { MainMenuLink, mainMenuItemSx } from "./MainMenuLink";

export type MainMenuItem = {
  label: string;
  shortLabel?: string;
  to?: string;
  state?: Record<string, unknown>;
  onClick?: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  icon?: ReactNode;
};

type Props = {
  label: string;
  items: MainMenuItem[];
  accountItems?: MainMenuItem[];
  adminItems?: MainMenuItem[];
  profileMenu?: { icon: ReactNode; items: MainMenuItem[] };
};

export function ResponsiveMainMenu({ label, items, accountItems = [], adminItems = [], profileMenu }: Props) {
  const { pathname, key } = useLocation();
  const theme = useTheme();
  // Keep the labelled links and admin status badge comfortably within the header.
  const mobile = useMediaQuery(theme.breakpoints.down("lg"));
  const id = useId();
  const menuId = `${id}-navigation`;
  const adminMenuId = `${id}-admin`;
  const adminButtonId = `${id}-admin-button`;
  const profileMenuId = `${id}-profile`;
  const profileButtonId = `${id}-profile-button`;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adminAnchor, setAdminAnchor] = useState<HTMLElement | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const profileItems = profileMenu?.items ?? [];
  const profileCurrent = profileItems.some((item) => item.to && navigationCurrent(pathname, item.to));

  function close() {
    setAnchor(null);
    setAdminAnchor(null);
    setProfileAnchor(null);
  }
  useEffect(close, [key, mobile, adminItems.length, profileItems.length]);

  function menuItem(item: MainMenuItem) {
    const current = item.to ? navigationCurrent(pathname, item.to) : undefined;
    const select = () => { close(); item.onClick?.(); };
    const content = <>
      {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
      <ListItemText>{item.label}</ListItemText>
    </>;
    return item.to ? (
      <MenuItem key={item.to} component={MainMenuLink} to={item.to} state={item.state}
        disabled={item.disabled} aria-current={current} selected={!!current}
        sx={mainMenuItemSx} onClick={select}>
        {content}
      </MenuItem>
    ) : (
      <MenuItem key={item.label} disabled={item.disabled} onClick={select}>
        {content}
      </MenuItem>
    );
  }

  function desktopItem(item: MainMenuItem) {
    const variant = item.emphasized ? "contained" : "text";
    const color = item.emphasized ? "primary" : "inherit";
    return item.to ? (
      <Button key={item.to} component={MainMenuLink} to={item.to} state={item.state}
        variant={variant} color={color} disabled={item.disabled}
        aria-label={item.label} aria-current={navigationCurrent(pathname, item.to)}
        sx={mainMenuItemSx} startIcon={item.icon} onClick={item.onClick}>
        {item.shortLabel ?? item.label}
      </Button>
    ) : (
      <Button key={item.label} variant={variant} color={color}
        disabled={item.disabled} startIcon={item.icon} onClick={item.onClick}>
        {item.label}
      </Button>
    );
  }

  return (
    <Box component="nav" aria-label={label}>
      {mobile ? (
        <>
          <Tooltip title="Open navigation menu">
            <IconButton color="inherit" aria-label="Open navigation menu"
              aria-controls={anchor ? menuId : undefined} aria-haspopup="true"
              aria-expanded={!!anchor} onClick={(event) => setAnchor(event.currentTarget)}>
              <MenuRoundedIcon />
            </IconButton>
          </Tooltip>
          <Menu id={menuId} anchorEl={anchor} open={!!anchor} onClose={close}
            MenuListProps={{ "aria-label": label }}>
            {items.map(menuItem)}
            {!!adminItems.length && <Divider />}
            {!!adminItems.length && (
              <ListSubheader disableSticky sx={{ lineHeight: "32px", fontSize: "0.75rem", bgcolor: "transparent" }}>
                Admin
              </ListSubheader>
            )}
            {adminItems.map(menuItem)}
            {!!profileItems.length && <Divider />}
            {!!profileItems.length && (
              <ListSubheader disableSticky sx={{ lineHeight: "32px", fontSize: "0.75rem", bgcolor: "transparent" }}>
                Profile
              </ListSubheader>
            )}
            {profileItems.map(menuItem)}
            {accountItems.map(menuItem)}
          </Menu>
        </>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          {items.map(desktopItem)}
          {!!adminItems.length && (
            <>
              <Button id={adminButtonId} color="inherit" sx={mainMenuItemSx}
                startIcon={<AdminPanelSettingsRoundedIcon />} endIcon={<ExpandMoreRoundedIcon />}
                aria-current={pageNavigation(pathname).admin ? "location" : undefined}
                aria-controls={adminAnchor ? adminMenuId : undefined} aria-haspopup="true"
                aria-expanded={!!adminAnchor} onClick={(event) => { close(); setAdminAnchor(event.currentTarget); }}>
                Admin
              </Button>
              <Menu id={adminMenuId} anchorEl={adminAnchor} open={!!adminAnchor} onClose={close}
                MenuListProps={{ "aria-labelledby": adminButtonId }}>
                {adminItems.map(menuItem)}
              </Menu>
            </>
          )}
          {!!profileItems.length && (
            <>
              <Tooltip title="Profile">
                <IconButton id={profileButtonId} color="inherit" aria-label="Profile menu"
                  sx={{ p: 0.5, minWidth: 44, minHeight: 44, ...mainMenuItemSx }}
                  aria-current={profileCurrent ? "location" : undefined}
                  aria-controls={profileAnchor ? profileMenuId : undefined} aria-haspopup="true"
                  aria-expanded={!!profileAnchor} onClick={(event) => { close(); setProfileAnchor(event.currentTarget); }}>
                  {profileMenu?.icon}
                </IconButton>
              </Tooltip>
              <Menu id={profileMenuId} anchorEl={profileAnchor} open={!!profileAnchor} onClose={close}
                MenuListProps={{ "aria-labelledby": profileButtonId }}>
                {profileItems.map(menuItem)}
              </Menu>
            </>
          )}
          {accountItems.map(desktopItem)}
        </Stack>
      )}
    </Box>
  );
}
