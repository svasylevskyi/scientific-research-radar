import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { pageNavigation, shouldResetPageScroll } from "../navigation";

export function PageNavigation() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(location);

  useLayoutEffect(() => {
    document.title = pageNavigation(location.pathname).title;
    if (shouldResetPageScroll(previous.current, location, navigationType)) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    previous.current = location;
  }, [location, navigationType]);

  return null;
}
