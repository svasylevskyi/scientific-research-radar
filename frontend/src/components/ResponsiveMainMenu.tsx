import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import {
  Box, Button, Divider, IconButton, ListSubheader, Menu, MenuItem, Stack,
  Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import { useEffect, useId, useState } from "react";
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
};

type Props = {
  label: string;
  items: MainMenuItem[];
  accountItems?: MainMenuItem[];
  adminItems?: MainMenuItem[];
};

export function ResponsiveMainMenu({ label, items, accountItems = [], adminItems = [] }: Props) {
  const { pathname, key } = useLocation();
  const theme = useTheme();
  // Text labels and the admin status badge need more room than the former icons.
  const mobile = useMediaQuery(theme.breakpoints.down("lg"));
  const id = useId();
  const menuId = `${id}-navigation`;
  const adminMenuId = `${id}-admin`;
  const adminButtonId = `${id}-admin-button`;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adminAnchor, setAdminAnchor] = useState<HTMLElement | null>(null);

  function close() {
    setAnchor(null);
    setAdminAnchor(null);
  }
  useEffect(close, [key, mobile, adminItems.length]);

  function mobileItem(item: MainMenuItem) {
    const current = item.to ? navigationCurrent(pathname, item.to) : undefined;
    const select = () => { close(); item.onClick?.(); };
    return item.to ? (
      <MenuItem key={item.to} component={MainMenuLink} to={item.to} state={item.state}
        disabled={item.disabled} aria-current={current} selected={!!current}
        sx={mainMenuItemSx} onClick={select}>
        {item.label}
      </MenuItem>
    ) : (
      <MenuItem key={item.label} disabled={item.disabled} onClick={select}>
        {item.label}
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
        sx={mainMenuItemSx} onClick={item.onClick}>
        {item.shortLabel ?? item.label}
      </Button>
    ) : (
      <Button key={item.label} variant={variant} color={color}
        disabled={item.disabled} onClick={item.onClick}>
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
            {items.map(mobileItem)}
            {!!adminItems.length && <Divider />}
            {!!adminItems.length && (
              <ListSubheader disableSticky sx={{ lineHeight: "32px", fontSize: "0.75rem", bgcolor: "transparent" }}>
                Admin
              </ListSubheader>
            )}
            {adminItems.map(mobileItem)}
            {accountItems.map(mobileItem)}
          </Menu>
        </>
      ) : (
        <Stack direction="row" spacing={1} alignItems="center">
          {items.map(desktopItem)}
          {!!adminItems.length && (
            <>
              <Button id={adminButtonId} color="inherit" sx={mainMenuItemSx}
                aria-current={pageNavigation(pathname).admin ? "location" : undefined}
                aria-controls={adminAnchor ? adminMenuId : undefined} aria-haspopup="true"
                aria-expanded={!!adminAnchor} onClick={(event) => setAdminAnchor(event.currentTarget)}>
                Admin
              </Button>
              <Menu id={adminMenuId} anchorEl={adminAnchor} open={!!adminAnchor} onClose={close}
                MenuListProps={{ "aria-labelledby": adminButtonId }}>
                {adminItems.map(mobileItem)}
              </Menu>
            </>
          )}
          {accountItems.map(desktopItem)}
        </Stack>
      )}
    </Box>
  );
}
