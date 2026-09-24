import { Navigate, useLocation } from "react-router-dom";
import { radarPathname } from "../workspaceRoutes";

export function LegacyWorkspaceRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: radarPathname(location.pathname), search: location.search, hash: location.hash }}
      state={location.state}
      replace
    />
  );
}
