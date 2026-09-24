import { Link } from "@mui/material";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { pageNavigation } from "../navigation";
import { focusMainContent, schedulePageFocus } from "../pageFocus";

export function NavigationAccessibility() {
  const { pathname, hash } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    document.title = pageNavigation(pathname).title;
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (!changed) return;
    // Subscription sections manage their own focus, including delayed data loads.
    if (pathname === "/subscription" && hash) return;
    return schedulePageFocus();
    // Query strings and fragments represent in-page actions, not a new page.
  }, [pathname]);

  return (
    <Link
      href="#main-content"
      onClick={(event) => {
        // Keep in-page state and password-reset token fragments intact.
        event.preventDefault();
        focusMainContent();
      }}
      sx={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: (theme) => theme.zIndex.modal + 1,
        transform: "translateY(calc(-100% - 16px))",
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
        color: "primary.dark",
        border: "2px solid currentColor",
        borderRadius: 1,
        fontWeight: 700,
        "&:focus": { transform: "none", outline: "2px solid", outlineOffset: 2 },
      }}
    >
      Skip to main content
    </Link>
  );
}
