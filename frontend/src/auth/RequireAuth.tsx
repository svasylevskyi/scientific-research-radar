import { Alert, Box, Button, CircularProgress } from "@mui/material";
import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: PropsWithChildren) {
  const { user, isInitializing, initializationError, retryInitialization } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <Box
        component="main" id="main-content" tabIndex={-1} data-navigation-pending
        sx={{ minHeight: "100%", display: "grid", placeItems: "center" }}
      >
        <Box role="status" aria-label="Restoring your session">
          <CircularProgress size={32} />
        </Box>
      </Box>
    );
  }

  if (initializationError && !user) {
    return <Box component="main" id="main-content" tabIndex={-1} sx={{ p: 3 }}><Alert severity="warning" action={<Button onClick={retryInitialization}>Retry</Button>}>
      {initializationError}
    </Alert></Box>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
