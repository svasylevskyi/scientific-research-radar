import { Box, CircularProgress } from "@mui/material";
import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: PropsWithChildren) {
  const { user, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <Box
        role="status"
        aria-label="Restoring your session"
        sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

