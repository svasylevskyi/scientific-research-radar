import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function RequireAdmin({ children }: PropsWithChildren) {
  const { user } = useAuth();
  return user?.role === "admin" ? children : <Navigate to="/" replace />;
}
