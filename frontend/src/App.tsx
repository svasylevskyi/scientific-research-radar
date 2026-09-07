import { Box } from "@mui/material";
import { SiteFooter } from "./components/SiteFooter";
import { LandingPage } from "./pages/LandingPage";
import { PlansPage } from "./pages/PlansPage";
import { LegalPage } from "./pages/LegalPage";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import { AdminDigestsPage } from "./pages/AdminDigestsPage";
import { AdminUserDetailPage } from "./pages/AdminUserDetailPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DigestDetailPage } from "./pages/DigestDetailPage";
import { DigestHistoryPage } from "./pages/DigestHistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NewDigestPage } from "./pages/NewDigestPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";

function LegacyDigestHistoryRedirect() {
  const { digestId } = useParams();
  const location = useLocation();
  return <Navigate to={`/digests/${digestId}${location.search}`} state={location.state} replace />;
}

export default function App() {
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", "& > *": { flex: 1 } }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route
            path="/radar"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/digests/new"
            element={
              <RequireAuth>
                <NewDigestPage />
              </RequireAuth>
            }
          />
          <Route
            path="/digests/:digestId"
            element={
              <RequireAuth>
                <DigestDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/digests/:digestId/history"
            element={
              <RequireAuth>
                <LegacyDigestHistoryRedirect />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <RequireAdmin><AdminUsersPage /></RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users/:userId"
            element={
              <RequireAuth>
                <RequireAdmin><AdminUserDetailPage /></RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/digests"
            element={
              <RequireAuth>
                <RequireAdmin><AdminDigestsPage /></RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/digests/:digestId"
            element={
              <RequireAuth>
                <RequireAdmin><DigestDetailPage admin /></RequireAdmin>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/digests/:digestId/runs"
            element={
              <RequireAuth>
                <RequireAdmin><DigestHistoryPage admin /></RequireAdmin>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
      <SiteFooter />
    </Box>
  );
}
