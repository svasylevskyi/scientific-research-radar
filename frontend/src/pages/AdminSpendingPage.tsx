import { Link } from "react-router-dom";
import { Chip } from "@mui/material";
import {
  spendingPresets,
  spendingRange,
  validSpendingRange,
  type SpendingPreset,
} from "../admin/spending";
import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { AppHeader } from "../components/AppHeader";
import { ApiError, apiRequest } from "../api/client";

type Report = import("../types/api-contracts").ApiResponse<"/api/v1/admin/spending", "get">;
const money = (value: string | null) =>
  value === null
    ? "Not reported"
    : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(Number(value));
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export function AdminSpendingPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState<SpendingPreset | "">("thisMonth");
  const validRange = validSpendingRange(from, to);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(event: FormEvent) {
    event.preventDefault();
    if (!validRange || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(
        await apiRequest<Report>(
          `/admin/spending?${new URLSearchParams({ from_date: from, to_date: to })}`,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not load spending. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Box>
      <AppHeader />
      <Container component="main" id="main-content" tabIndex={-1} maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button component={Link} to="/admin/pricing">
          Back to pricing
        </Button>
        <Typography component="h1" variant="h3" gutterBottom>
          OpenAI spending
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Compare OpenAI’s reported project spending with this environment’s
          recorded research estimates.
        </Typography>
        <Stack spacing={3}>
          <Paper
            variant="outlined"
            component="form"
            onSubmit={load}
            sx={{ p: 3, borderRadius: 3 }}
          >
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              flexWrap="wrap"
              sx={{ mb: 2 }}
              aria-label="Date presets"
            >
              {spendingPresets.map((item) => (
                <Button
                  key={item.id}
                  size="small"
                  variant={preset === item.id ? "contained" : "outlined"}
                  aria-pressed={preset === item.id}
                  disabled={loading}
                  onClick={() => {
                    const range = spendingRange(item.id);
                    setFrom(range.from);
                    setTo(range.to);
                    setPreset(item.id);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                required
                label="From (UTC)"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreset("");
                }}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { max: to || today() },
                }}
                disabled={loading}
              />
              <TextField
                required
                label="To (UTC, inclusive)"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPreset("");
                }}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: from, max: today() },
                }}
                disabled={loading}
              />
              <Button
                variant="contained"
                type="submit"
                disabled={loading || !validRange}
              >
                {loading ? "Loading…" : "Load spending"}
              </Button>
            </Stack>
            {!validRange && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Choose an inclusive range of 1–93 days ending no later than
                today (UTC).
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Up to 93 days. Provider results are cached for five minutes;
              loading does not trigger research runs.
            </Typography>
          </Paper>
          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Typography role="status">Retrieving spending details…</Typography>
          )}
          {data && (
            <>
              <Alert severity="info">
                Period: {data.from_date}–{data.to_date} (UTC). Project:{" "}
                {data.project_id}. Provider data fetched:{" "}
                {new Date(data.fetched_at).toLocaleString()}.
              </Alert>
              <Alert severity="warning">
                OpenAI reporting can lag. Provider totals may include other
                applications or environments in this project. Local estimates
                use request creation dates and exclude unknown costs; older
                discarded usage cannot be recovered. These figures are not an
                exact reconciliation or an invoice.
              </Alert>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Paper variant="outlined" sx={{ p: 3, flex: 1 }}>
                  <Typography color="text.secondary">
                    OpenAI reported total
                  </Typography>
                  <Typography variant="h4">
                    {money(data.reported_usd)}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 3, flex: 1 }}>
                  <Typography color="text.secondary">
                    Local known estimate subtotal
                  </Typography>
                  <Typography variant="h4">
                    {money(data.known_estimated_usd)}
                  </Typography>
                  <Chip
                    sx={{ mt: 1 }}
                    color={
                      data.unknown_requests || data.legacy_runs
                        ? "warning"
                        : "default"
                    }
                    label={
                      data.unknown_requests || data.legacy_runs
                        ? "Incomplete local estimate"
                        : "All recorded attempts priced"
                    }
                  />
                </Paper>
              </Stack>
              {(data.unknown_requests > 0 || data.legacy_runs > 0) && (
                <Alert severity="warning">
                  {data.unknown_requests} unpriced attempts are excluded from
                  the local subtotal; their cost is unknown, not zero.{" "}
                  {data.legacy_runs} runs started in this period have ledger
                  gaps. Missing usage or unsupported pricing may cause gaps;
                  updating pricing does not retroactively price older requests.{" "}
                  <Button component={Link} to="/admin/pricing">
                    Review pricing
                  </Button>
                </Alert>
              )}
              <Paper
                variant="outlined"
                sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}
              >
                <Typography variant="h6">Daily comparison</Typography>
                <TableContainer sx={{ display: { xs: "none", sm: "block" } }}>
                  <Table size="small" aria-label="Daily spending">
                    <TableHead>
                      <TableRow>
                        {[
                          "Day (UTC)",
                          "OpenAI reported",
                          "Local known estimate",
                          "Local attempts",
                          "Unpriced attempts",
                        ].map((h) => (
                          <TableCell key={h}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.daily.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{money(row.reported_usd)}</TableCell>
                          <TableCell>
                            {money(row.known_estimated_usd)}
                          </TableCell>
                          <TableCell>{row.requests}</TableCell>
                          <TableCell>
                            {row.unknown_requests ? (
                              <Chip
                                size="small"
                                color="warning"
                                label={`${row.unknown_requests} unpriced`}
                              />
                            ) : (
                              "0"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Stack
                  sx={{ display: { xs: "flex", sm: "none" }, mt: 2 }}
                  spacing={2}
                >
                  {data.daily.map((row) => (
                    <Paper variant="outlined" key={row.date} sx={{ p: 2 }}>
                      <Typography fontWeight={700}>{row.date} UTC</Typography>
                      <Typography>OpenAI: {money(row.reported_usd)}</Typography>
                      <Typography>
                        Local known estimate: {money(row.known_estimated_usd)}
                      </Typography>
                      <Typography variant="body2">
                        {row.requests} local attempts
                      </Typography>
                      {row.unknown_requests > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          label={`${row.unknown_requests} unpriced — excluded`}
                        />
                      )}
                    </Paper>
                  ))}
                </Stack>
                {!data.daily.length && (
                  <Typography>
                    No daily usage returned for this period.
                  </Typography>
                )}
              </Paper>
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                <Typography variant="h6">Reported charges</Typography>
                {!data.charges.length ? (
                  <Typography>No charges returned for this period.</Typography>
                ) : (
                  <TableContainer>
                    <Table
                      size="small"
                      aria-label="Reported charges"
                      sx={{
                        "& td": { overflowWrap: "anywhere" },
                        "@media (max-width: 599px)": {
                          "&, & tbody, & tr, & td": { display: "block" },
                          "& thead": { display: "none" },
                          "& td": { borderBottom: 0 },
                          "& tr": { borderBottom: 1, borderColor: "divider" },
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Charge</TableCell>
                          <TableCell>Reported USD</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.charges.map((row) => (
                          <TableRow key={row.line_item}>
                            <TableCell>{row.line_item}</TableCell>
                            <TableCell>{money(row.reported_usd)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
