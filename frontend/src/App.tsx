import { Navigate, Route, Routes } from "react-router-dom";

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

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
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
            <DigestHistoryPage />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
