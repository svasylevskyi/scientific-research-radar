import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";

/** Keep the scroll request on the destination, including same-page selections. */
export const MainMenuLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function MainMenuLink({ state, ...props }, ref) {
    return <Link {...props} ref={ref} state={{ ...state, scrollToTop: true }} />;
  },
);

// Applied only to main-menu controls, never to footer links or local navigation.
export const mainMenuItemSx = {
  "&[aria-current]": {
    bgcolor: "rgba(8, 125, 103, 0.08)",
    "&:hover": { bgcolor: "rgba(8, 125, 103, 0.12)" },
  },
};
