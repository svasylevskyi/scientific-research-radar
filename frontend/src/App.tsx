import { AboutPage } from "./pages/AboutPage";
import { PageNavigation } from "./components/PageNavigation";
import { ContactPage } from "./pages/ContactPage";
import { AdminMessagesPage } from "./pages/AdminMessagesPage";
import { AdminSubscriptionPlanEditPage } from "./pages/AdminSubscriptionPlanEditPage";
import { AdminPricingEditPage } from "./pages/AdminPricingEditPage";
import { SubscriptionAccessPage } from "./pages/SubscriptionAccessPage";
import { AdminBillingSyncPage } from "./pages/AdminBillingSyncPage";
import { AdminSubscriptionObservationPage } from "./pages/AdminSubscriptionObservationPage";
import { AdminSandboxBillingPage } from "./pages/AdminSandboxBillingPage";
import { AdminSubscriptionPlansPage } from "./pages/AdminSubscriptionPlansPage";
import { Box } from "@mui/material";
import { SiteFooter } from "./components/SiteFooter";
import { LandingPage } from "./pages/LandingPage";
import { PlansPage } from "./pages/PlansPage";
import { LegalPage } from "./pages/LegalPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordRecoveryPage";
import { matchPath, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LegacyWorkspaceRedirect } from "./components/LegacyWorkspaceRedirect";
import { radarPathname } from "./workspaceRoutes";

import { RequireAuth } from "./auth/RequireAuth";
import { RequireAdmin } from "./auth/RequireAdmin";
import { AdminSpendingPage } from "./pages/AdminSpendingPage";
import { AdminPricingPage } from "./pages/AdminPricingPage";
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
  const { pathname } = useLocation();
  // Registration includes its email verification step; profile keeps its footer.
  const isAuthPage = ["/radar/login", "/radar/register", "/radar/forgot-password", "/radar/reset-password"]
    .some((path) => matchPath(path, radarPathname(pathname)));

  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <PageNavigation />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", "& > *": { flex: 1 } }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/radar/contact" element={<RequireAuth><ContactPage workspace /></RequireAuth>} />
          <Route path="/admin/messages" element={<RequireAuth><RequireAdmin><AdminMessagesPage /></RequireAdmin></RequireAuth>} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/radar/plans" element={<RequireAuth><PlansPage workspace /></RequireAuth>} />
          <Route path="/radar/register/plan" element={<RequireAuth><PlansPage enrolment /></RequireAuth>} />
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
          <Route path="/radar/login" element={<LoginPage />} />
          <Route path="/radar/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/radar/reset-password" element={<ResetPasswordPage />} />
          <Route path="/radar/register" element={<RegisterPage />} />
          <Route
            path="/radar/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/radar/digests/new"
            element={
              <RequireAuth>
                <NewDigestPage />
              </RequireAuth>
            }
          />
          <Route
            path="/radar/digests/:digestId"
            element={
              <RequireAuth>
                <DigestDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/radar/digests/:digestId/history"
            element={
              <RequireAuth>
                <LegacyWorkspaceRedirect />
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
          <Route path="/admin/spending" element={<RequireAuth><RequireAdmin superAdmin><AdminSpendingPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/subscription-observation" element={<RequireAuth><RequireAdmin><AdminSubscriptionObservationPage /></RequireAdmin></RequireAuth>} />
          <Route path="/radar/subscription" element={<RequireAuth><SubscriptionAccessPage /></RequireAuth>} />
          <Route path="/admin/subscription-access" element={<RequireAuth><RequireAdmin><SubscriptionAccessPage admin /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/billing-sync" element={<RequireAuth><RequireAdmin><AdminBillingSyncPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/subscription-testing" element={<RequireAuth><RequireAdmin><AdminSandboxBillingPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/subscription-plans" element={<RequireAuth><RequireAdmin><AdminSubscriptionPlansPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/subscription-plans/new" element={<RequireAuth><RequireAdmin><AdminSubscriptionPlanEditPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/subscription-plans/:code/edit" element={<RequireAuth><RequireAdmin><AdminSubscriptionPlanEditPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/pricing/new" element={<RequireAuth><RequireAdmin superAdmin><AdminPricingEditPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/pricing/:priceId/copy" element={<RequireAuth><RequireAdmin superAdmin><AdminPricingEditPage /></RequireAdmin></RequireAuth>} />
          <Route path="/admin/pricing" element={<RequireAuth><RequireAdmin superAdmin><AdminPricingPage /></RequireAdmin></RequireAuth>} />
          <Route path="/login" element={<LegacyWorkspaceRedirect />} />
          <Route path="/register" element={<LegacyWorkspaceRedirect />} />
          <Route path="/register/plan" element={<LegacyWorkspaceRedirect />} />
          <Route path="/forgot-password" element={<LegacyWorkspaceRedirect />} />
          <Route path="/reset-password" element={<LegacyWorkspaceRedirect />} />
          <Route path="/profile" element={<LegacyWorkspaceRedirect />} />
          <Route path="/subscription" element={<LegacyWorkspaceRedirect />} />
          <Route path="/digests/new" element={<LegacyWorkspaceRedirect />} />
          <Route path="/digests/:digestId" element={<LegacyWorkspaceRedirect />} />
          <Route path="/digests/:digestId/history" element={<LegacyWorkspaceRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
      {!isAuthPage && <SiteFooter />}
    </Box>
  );
}
