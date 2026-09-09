import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function RequireAdmin({ children, superAdmin = false }: PropsWithChildren<{ superAdmin?: boolean }>) {
  const { user } = useAuth();
  return user?.role === "admin" && (!superAdmin || user.is_super_admin) ? children : <Navigate to="/radar" replace />;
}
