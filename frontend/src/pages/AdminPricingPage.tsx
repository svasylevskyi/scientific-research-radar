import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
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
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";
import { rates, type Price, type PriceList } from "../admin/pricing";
const PAGE_SIZE = 25;
function Copy({ row }: { row: Price }) {
  return (
    <Button
      component={Link}
      to={`/admin/pricing/${row.id}/copy`}
      aria-label={`Use ${row.model_name} ${row.version} as a new version`}
      endIcon={<ChevronRightRoundedIcon />}
    >
      Use as new version
    </Button>
  );
}
export function AdminPricingPage() {
  const location = useLocation();
  const [list, setList] = useState<PriceList>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<PriceList>(
      `/admin/pricing?offset=${(page - 1) * PAGE_SIZE}&limit=${PAGE_SIZE}`,
    )
      .then((result) => {
        if (active) setList(result);
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Could not load pricing. Reload to retry.",
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
              <PaymentsRoundedIcon color="primary" />
              <Typography component="h1" variant="h3">
                Radar pricing
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              Manage estimated research costs in USD. Only the super-admin can
              view or publish these rates.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button disabled={loading} onClick={() => setRefresh((v) => v + 1)}>
              Reload
            </Button>
            <Button
              component={Link}
              to="/admin/pricing/new"
              variant="contained"
              sx={{ whiteSpace: "nowrap" }}
            >
              New pricing version
            </Button>
          </Stack>
        </Stack>
        <Button
          component={Link}
          to="/admin/spending"
          variant="outlined"
          sx={{ mb: 3 }}
        >
          View OpenAI spending
        </Button>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Versions are retained for audit. To change rates, use an existing
          version as the starting point and publish a new one. Token rates below
          are USD per million tokens; search is USD per call.
        </Typography>
        {location.state?.published && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Pricing published. New requests will use this version; existing
            estimates are unchanged.
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
            aria-label="Loading pricing"
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
                    <Table aria-label="Pricing versions">
                      <TableHead>
                        <TableRow>
                          {[
                            "Model / version",
                            "Status",
                            "Input",
                            "Cached input",
                            "Cache writes",
                            "Output",
                            "Search / call",
                            "Max input",
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
                        {list.items.map((row) => (
                          <TableRow key={row.id} hover>
                            <TableCell sx={{ overflowWrap: "anywhere" }}>
                              <Typography fontWeight={700}>
                                {row.model_name}
                              </Typography>
                              {row.version}
                              <Typography variant="caption" display="block">
                                {new Date(row.created_at).toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={
                                  row.is_current ? "Current" : "Historical"
                                }
                                color={row.is_current ? "success" : "default"}
                                variant="outlined"
                              />
                            </TableCell>
                            {rates.map(([key]) => (
                              <TableCell key={key}>
                                {row[key] == null
                                  ? "Not configured"
                                  : `$${row[key]}`}
                              </TableCell>
                            ))}
                            <TableCell>
                              {row.max_input_tokens.toLocaleString()}
                            </TableCell>
                            <TableCell align="right">
                              <Copy row={row} />
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
                    {list.items.map((row) => (
                      <Paper
                        key={row.id}
                        variant="outlined"
                        sx={{ p: 2.25, borderRadius: 3 }}
                      >
                        <Typography
                          fontWeight={750}
                          sx={{ overflowWrap: "anywhere" }}
                        >
                          {row.model_name}
                        </Typography>
                        <Typography
                          color="text.secondary"
                          sx={{ overflowWrap: "anywhere", mb: 1 }}
                        >
                          {row.version} ·{" "}
                          {new Date(row.created_at).toLocaleString()}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={row.is_current ? "Current" : "Historical"}
                          color={row.is_current ? "success" : "default"}
                        />
                        <Stack spacing={0.5} sx={{ my: 2 }}>
                          {rates.map(([key, label]) => (
                            <Typography key={key} variant="body2">
                              {label}:{" "}
                              {row[key] == null
                                ? "Not configured"
                                : `$${row[key]}`}
                            </Typography>
                          ))}
                          <Typography variant="body2">
                            Maximum input tokens:{" "}
                            {row.max_input_tokens.toLocaleString()}
                          </Typography>
                        </Stack>
                        <Copy row={row} />
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
                  <Typography variant="h6">No pricing configured</Typography>
                  <Typography color="text.secondary">
                    Usage is recorded, but monetary estimates remain unknown
                    until you add a tariff.
                  </Typography>
                  <Button
                    component={Link}
                    to="/admin/pricing/new"
                    sx={{ mt: 2 }}
                  >
                    New pricing version
                  </Button>
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
                {list.total} pricing {list.total === 1 ? "version" : "versions"}
              </Typography>
            </>
          )
        )}
      </Container>
    </Box>
  );
}
