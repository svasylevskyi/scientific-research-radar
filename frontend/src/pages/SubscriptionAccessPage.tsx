import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import {
  SubscriptionData,
  useSubscription,
} from "../components/SubscriptionData";
import {
  SubscriptionOverview,
  subscriptionDate,
} from "../components/SubscriptionOverview";
import { SubscriberBilling } from "../components/SubscriberBilling";
import { SubscriptionUpgrades } from "../components/SubscriptionUpgrades";
import { SubscriptionChanges } from "../components/SubscriptionChanges";
import { FreeDigestPreferences } from "../components/FreeDigestPreferences";
import { PaidDigestPreferences } from "../components/PaidDigestPreferences";
import { AdminSubscriptionAccessPage } from "./AdminSubscriptionAccessPage";
import { subscriptionSection } from "../subscriptionPresentation";

export function SubscriptionAccessPage({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  if (admin) return <AdminSubscriptionAccessPage />;
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Typography component="h1" variant="h3" gutterBottom>
          Subscription and usage
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Your plan, remaining research allowances, and subscription settings.
        </Typography>
        <SubscriptionData key={user?.id}>
          <SubscriberSections />
        </SubscriptionData>
      </Container>
    </Box>
  );
}
function SubscriberSections() {
  const { access, notices, upgrades, changes } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const section = subscriptionSection(location.hash);
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  }, [location.hash]);
  return (
    <Stack spacing={3}>
      <SubscriptionOverview />
      <Tabs
        value={section}
        onChange={(_, value) =>
          navigate(
            { hash: "#" + value, search: location.search },
            { preventScrollReset: true },
          )
        }
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Subscription settings"
      >
        <Tab
          id="subscription-tab-plans"
          value="plans"
          label="Plan changes"
          aria-controls="subscription-panel-plans"
        />
        <Tab
          id="subscription-tab-billing"
          value="billing"
          label="Billing and invoices"
          aria-controls="subscription-panel-billing"
        />
        <Tab
          id="subscription-tab-digests"
          value="digests"
          label="Active digests"
          aria-controls="subscription-panel-digests"
        />
        <Tab
          id="subscription-tab-notifications"
          value="notifications"
          label={`Notifications (${notices.length})`}
          aria-controls="subscription-panel-notifications"
        />
      </Tabs>
      {(["plans", "billing", "digests", "notifications"] as const).map(
        (name) => (
          <Box
            key={name}
            role="tabpanel"
            id={`subscription-panel-${name}`}
            aria-labelledby={`subscription-tab-${name}`}
            hidden={section !== name}
          >
            <Stack
              spacing={2}
              id={name}
              tabIndex={-1}
              sx={{ scrollMarginTop: 100 }}
            >
              {name === "plans" && (
                <>
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography>
                      Paid upgrades start after the prorated payment is
                      verified. Downgrades and monthly/yearly switches start at
                      renewal. Free is available after registration; cancelling
                      a paid plan moves it to Free after verified paid access
                      ends.
                    </Typography>
                    {(access.billing_type === "stripe" || upgrades.upgrade) && <Button component={Link} to="/plans">
                      Compare available plans
                    </Button>}
                  </Paper>
                  {(access.billing_type === "stripe" || upgrades.upgrade) ? (
                    <SubscriptionUpgrades />
                  ) : (
                    <Paper id="upgrade" tabIndex={-1} variant="outlined" sx={{ p: 3, scrollMarginTop: 100 }}>
                      <Typography variant="h6">Upgrade options</Typography>
                      <Typography>Compare paid plans and their included allowances.</Typography>
                      <Button component={Link} to="/plans">Compare paid plans</Button>
                    </Paper>
                  )}
                  <Box id="changes" tabIndex={-1} sx={{ scrollMarginTop: 100 }}>
                    {(access.billing_type === "stripe" || changes.change) && (
                      <SubscriptionChanges />
                    )}
                  </Box>
                </>
              )}
              {name === "billing" && (
                <>
                  <SubscriberBilling />
                  <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="h6">
                      Payment and access details
                    </Typography>
                    <Typography>
                      Payment status:{" "}
                      {access.payment_status ?? "Not applicable"}
                    </Typography>
                    <Typography>
                      Verified paid coverage through:{" "}
                      {subscriptionDate(access.paid_through)}
                    </Typography>
                    <Typography>
                      Last verified: {subscriptionDate(access.observed_at)}
                    </Typography>
                    {access.grace_until && (
                      <Typography>
                        Payment grace ends:{" "}
                        {subscriptionDate(access.grace_until)}
                      </Typography>
                    )}
                    {access.payment_issue && (
                      <Alert severity="warning">{access.payment_issue}</Alert>
                    )}
                    <Typography variant="body2">
                      A Stripe return page is not proof of payment. Benefits
                      follow verified payment and subscription status. Saved
                      research remains available when research access is paused.
                    </Typography>
                  </Paper>
                </>
              )}
              {name === "digests" && (
                <>
                  <PaidDigestPreferences />
                  {access.mode === "sandbox" ? (
                    <FreeDigestPreferences />
                  ) : (
                    <Typography>
                      Complimentary access has no subscription digest limit.
                    </Typography>
                  )}
                  <Typography variant="body2">
                    Plan changes do not delete research. Paused schedules need
                    explicit review and saving before they resume.
                  </Typography>
                  <Button component={Link} to="/radar">
                    Open workspace
                  </Button>
                </>
              )}
              {name === "notifications" && (
                <>
                  {!notices.length && (
                    <Typography>No subscription notifications yet.</Typography>
                  )}
                  {notices.map((n) => (
                    <Alert
                      key={n.id}
                      severity={
                        n.email_status === "failed" ? "warning" : "info"
                      }
                    >
                      <Typography fontWeight={700}>{n.subject}</Typography>
                      <Typography variant="caption">
                        {subscriptionDate(n.created_at)}
                      </Typography>
                      <Typography sx={{ whiteSpace: "pre-line" }}>
                        {n.text}
                      </Typography>
                      {n.email_status === "failed" && (
                        <Typography variant="body2">
                          Email delivery failed. This notification remains
                          available here.
                        </Typography>
                      )}
                    </Alert>
                  ))}
                </>
              )}
            </Stack>
          </Box>
        ),
      )}
    </Stack>
  );
}
