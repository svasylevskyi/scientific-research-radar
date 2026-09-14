import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";
import { title, type Plan, type PlanList } from "../admin/plans";

const PAGE_SIZE = 25;
const price = (plan: Plan) =>
  `${plan.configuration.currency} ${plan.configuration.monthly_price} / month${plan.configuration.annual_price === null ? "" : ` · ${plan.configuration.currency} ${plan.configuration.annual_price} / year`}`;
function Status({ plan }: { plan: Plan }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Chip size="small" label={title(plan.configuration.state)} />
      <Chip
        size="small"
        variant="outlined"
        color={plan.configuration.subscriber_visible ? "success" : "default"}
        label={
          plan.configuration.subscriber_visible ? "Published" : "Not published"
        }
      />
    </Stack>
  );
}
function Edit({ plan }: { plan: Plan }) {
  return (
    <Button
      component={Link}
      to={`/admin/subscription-plans/${plan.code}/edit`}
      aria-label={`Edit ${plan.configuration.name}`}
      endIcon={<ChevronRightRoundedIcon />}
    >
      Edit
    </Button>
  );
}
function Billing({ plan }: { plan: Plan }) {
  return (
    <Typography variant="body2">
      {plan.configuration.billing_type === "free"
        ? "Free · Radar"
        : `Stripe · ${plan.configuration.stripe_sandbox ? "Mapped" : "Not mapped"}`}
    </Typography>
  );
}
export function AdminSubscriptionPlansPage() {
  const location = useLocation();
  const [list, setList] = useState<PlanList>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<PlanList>(
      `/admin/subscription-plans?offset=${(page - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}`,
    )
      .then((data) => {
        if (active) setList(data);
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Could not load plans. Reload to retry.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, refresh]);
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          sx={{ mb: 4 }}
        >
          <Box>
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              sx={{ mb: 0.75 }}
            >
              <SubscriptionsRoundedIcon color="primary" />
              <Typography component="h1" variant="h3">
                Subscription plans
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              Review plan prices, publication status, and allowances. Open a
              plan to edit or review its history.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button disabled={loading} onClick={() => setRefresh((v) => v + 1)}>
              Reload
            </Button>
            <Button
              component={Link}
              to="/admin/subscription-plans/new"
              variant="contained"
              sx={{ whiteSpace: "nowrap" }}
            >
              New plan
            </Button>
          </Stack>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mb: 3 }}
        >
          <Button
            component={Link}
            to="/admin/subscription-testing"
            variant="outlined"
          >
            Test sandbox billing
          </Button>
          <Button
            component={Link}
            to="/admin/subscription-access"
            variant="outlined"
          >
            Subscription access
          </Button>
          <Button component={Link} to="/admin/billing-sync" variant="outlined">
            Billing synchronization
          </Button>
          <Button
            component={Link}
            to="/admin/subscription-observation"
            variant="outlined"
          >
            Assignments and usage
          </Button>
        </Stack>
        <Alert severity="info" sx={{ mb: 3 }}>
          Publishing a reviewed plan makes it visible for sandbox subscriber
          checkout. Existing subscriptions keep their saved revision and
          allowances.
        </Alert>
        {location.state?.savedPlan && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Saved {location.state.savedPlan}, revision {location.state.revision}
            . Existing access and billing are unchanged.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box
            role="status"
            aria-label="Loading plans"
            sx={{ py: 10, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : (
          !error && (
            <>
              {!!list.items.length && (
                <>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{
                      display: { xs: "none", md: "block" },
                      borderRadius: 3,
                    }}
                  >
                    <Table aria-label="Subscription plans">
                      <TableHead>
                        <TableRow>
                          {[
                            "Plan",
                            "Status",
                            "Prices",
                            "Monthly allowances",
                            "Billing",
                            "Actions",
                          ].map((label) => (
                            <TableCell
                              key={label}
                              align={label === "Actions" ? "right" : "left"}
                            >
                              {label}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {list.items.map((plan) => (
                          <TableRow key={plan.code} hover>
                            <TableCell>
                              <Typography
                                fontWeight={700}
                                sx={{ overflowWrap: "anywhere" }}
                              >
                                {plan.configuration.name}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {plan.code} · Revision {plan.revision}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Status plan={plan} />
                            </TableCell>
                            <TableCell>{price(plan)}</TableCell>
                            <TableCell>
                              {plan.configuration.max_digests} digests
                              <br />
                              {plan.configuration.papers_per_month} papers ·{" "}
                              {plan.configuration.runs_per_month} runs
                            </TableCell>
                            <TableCell>
                              <Billing plan={plan} />
                            </TableCell>
                            <TableCell align="right">
                              <Edit plan={plan} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Stack
                    spacing={1.5}
                    sx={{ display: { xs: "flex", md: "none" } }}
                  >
                    {list.items.map((plan) => (
                      <Paper
                        key={plan.code}
                        variant="outlined"
                        sx={{ p: 2.25, borderRadius: 3 }}
                      >
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              fontWeight={750}
                              sx={{ overflowWrap: "anywhere" }}
                            >
                              {plan.configuration.name}
                            </Typography>
                            <Typography color="text.secondary">
                              {plan.code} · Revision {plan.revision}
                            </Typography>
                          </Box>
                          <Edit plan={plan} />
                        </Stack>
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          <Status plan={plan} />
                          <Typography>{price(plan)}</Typography>
                          <Typography variant="body2">
                            {plan.configuration.max_digests} digests ·{" "}
                            {plan.configuration.papers_per_month} papers ·{" "}
                            {plan.configuration.runs_per_month} runs per month
                          </Typography>
                          <Billing plan={plan} />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </>
              )}
              {!list.items.length && (
                <Paper
                  variant="outlined"
                  sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}
                >
                  <Typography variant="h6">No plans yet</Typography>
                  <Typography color="text.secondary">
                    Choose New plan to create your first draft.
                  </Typography>
                </Paper>
              )}
              {list.total > PAGE_SIZE && (
                <Pagination
                  count={Math.ceil(list.total / PAGE_SIZE)}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                  sx={{ mt: 3, display: "flex", justifyContent: "center" }}
                />
              )}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2, textAlign: "center" }}
              >
                {list.total} {list.total === 1 ? "plan" : "plans"}
              </Typography>
            </>
          )
        )}
      </Container>
    </Box>
  );
}
