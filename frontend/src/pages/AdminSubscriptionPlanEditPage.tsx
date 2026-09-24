import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { StripeProductPicker } from "../components/StripeProductPicker";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";
import {
  blank,
  limits,
  frequencies,
  title,
  grid,
  type Configuration,
  type Plan,
  type SavedPlan,
  type PlanList,
  type StripeCheck,
} from "../admin/plans";

type PriceWarnings = import("../types/api.generated").components["schemas"]["PriceWarningsRead"];

export function AdminSubscriptionPlanEditPage() {
  const { code: routeCode } = useParams();
  return <PlanEditor key={routeCode ?? "new"} routeCode={routeCode} />;
}

function PlanEditor({ routeCode }: { routeCode?: string }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<Configuration>(blank);
  const [code, setCode] = useState("");
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [historyCode, setHistoryCode] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [history, setHistory] = useState<PlanList | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(!!routeCode);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [check, setCheck] = useState<{
    id: number;
    result?: StripeCheck;
    error?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [stripeValid, setStripeValid] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningStatus, setWarningStatus] = useState("");
  useEffect(() => {
    if (!routeCode) return;
    let active = true;
    setLoading(true);
    setError("");
    setPlan(null);
    setCheck(null);
    apiRequest<PlanList>(
      `/admin/subscription-plans/${encodeURIComponent(routeCode)}/revisions?limit=1`,
    )
      .then((data) => {
        if (!active) return;
        const latest = data.items[0];
        if (!latest) {
          setError(
            "Plan not found. Return to the catalogue to choose another plan.",
          );
          return;
        }
        setPlan(latest);
        setForm({
          ...latest.configuration,
          billing_type: latest.configuration.billing_type ?? "stripe",
        });
        setCode(latest.code);
        setRevision(latest.revision);
        setNote("");
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Could not load this plan. Retry loading it.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [routeCode, reload]);
  useEffect(() => {
    if (loading || (routeCode && !plan)) return;
    let active = true;
    setWarnings([]);
    setWarningStatus("Checking similar prices…");
    const timer = window.setTimeout(() => {
      apiRequest<PriceWarnings>(
        "/admin/subscription-plans/price-warnings",
        {
          method: "POST",
          body: { code, configuration: form },
        },
      )
        .then((data) => {
          if (active) {
            setWarnings(data.warnings);
            setWarningStatus("");
          }
        })
        .catch(() => {
          if (active)
            setWarningStatus(
              "Price comparison unavailable. Complete the form or reload the catalogue to retry.",
            );
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [code, form, refresh, loading, routeCode, plan]);
  useEffect(() => {
    if (!historyCode) return;
    let active = true;
    setHistory(null);
    setHistoryError(false);
    apiRequest<PlanList>(
      `/admin/subscription-plans/${historyCode}/revisions?offset=${historyOffset}&limit=25`,
    )
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch(() => {
        if (active) setHistoryError(true);
      });
    return () => {
      active = false;
    };
  }, [historyCode, historyOffset, refresh]);
  function update<K extends keyof Configuration>(
    key: K,
    value: Configuration[K],
  ) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function verify(plan: Plan) {
    setChecking(plan.id);
    setCheck(null);
    try {
      const result = await apiRequest<StripeCheck>(
        `/admin/subscription-plans/${plan.code}/revisions/${plan.revision}/check-stripe`,
        { method: "POST" },
      );
      setCheck({ id: plan.id, result });
    } catch (caught) {
      setCheck({
        id: plan.id,
        error:
          caught instanceof ApiError
            ? caught.message
            : "Could not check Stripe.",
      });
    } finally {
      setChecking(null);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.billing_type === "stripe" && !stripeValid) return;
    setSaving(true);
    setError("");
    try {
      const saved = await apiRequest<SavedPlan>("/admin/subscription-plans", {
        method: "POST",
        body: {
          code,
          expected_revision: revision,
          change_note: note,
          configuration: form,
        },
      });
      navigate("/admin/subscription-plans", {
        state: {
          savedPlan: saved.configuration.name,
          revision: saved.revision,
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save plan.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Box>
      <AppHeader />
      <Container component="main" id="main-content" tabIndex={-1} maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Button component={Link} to="/admin/subscription-plans" sx={{ mb: 2 }}>
          Back to plans
        </Button>
        <Typography component="h1" variant="h3" gutterBottom>
          {routeCode ? "Edit subscription plan" : "New subscription plan"}
        </Typography>
        <Stack spacing={3}>
          {error && (
            <Alert
              severity="error"
              action={
                routeCode && (
                  <Button
                    color="inherit"
                    disabled={saving || loading}
                    onClick={() => setReload((v) => v + 1)}
                  >
                    Reload plan
                  </Button>
                )
              }
            >
              {error}
            </Alert>
          )}
          {loading ? (
            <Typography role="status">Loading plan…</Typography>
          ) : (
            (!routeCode || plan) && (
              <>
                {plan && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Typography>
                        Saved revision {plan.revision} ·{" "}
                        {plan.configuration.name}
                      </Typography>
                      {plan.configuration.stripe_sandbox && (
                        <Button
                          disabled={checking !== null || saving}
                          onClick={() => void verify(plan)}
                        >
                          {checking === plan.id
                            ? "Checking Stripe…"
                            : "Check saved revision in Stripe"}
                        </Button>
                      )}
                      {check?.id === plan.id &&
                        (check.error ? (
                          <Alert severity="warning">{check.error}</Alert>
                        ) : (
                          check.result && (
                            <Alert
                              severity={
                                check.result.matches ? "success" : "warning"
                              }
                            >
                              {check.result.matches
                                ? "Stripe prices match this revision, including explicit inclusive tax behavior."
                                : "Stripe mapping needs attention."}
                              {check.result.issues.map((issue) => (
                                <Typography key={issue} variant="body2">
                                  {issue}
                                </Typography>
                              ))}
                              {check.result.prices.map((price) => (
                                <Typography
                                  key={price.price_id}
                                  variant="caption"
                                  display="block"
                                >
                                  {title(price.interval)}:{" "}
                                  {price.currency?.toUpperCase() ?? "Missing currency"}{" "}
                                  {price.unit_amount === null ? "Missing amount" : (price.unit_amount / 100).toFixed(2)} · Tax
                                  behavior: {price.tax_behavior ?? "Missing"}
                                </Typography>
                              ))}
                              <Typography variant="caption" display="block">
                                Checked{" "}
                                {new Date(
                                  check.result.checked_at,
                                ).toLocaleString()}
                                . This does not enable checkout or verify tax
                                registrations.
                              </Typography>
                            </Alert>
                          )
                        ))}
                      <Stack direction="row" spacing={1}>
                        <Button
                          onClick={() => {
                            setHistoryCode(plan.code);
                            setHistoryOffset(0);
                          }}
                        >
                          Revision history
                        </Button>
                        <Button
                          disabled={saving}
                          onClick={() => setRefresh((v) => v + 1)}
                        >
                          Reload Stripe catalogue and comparisons
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}
                {historyCode && (
                  <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Revision history · {historyCode}
                    </Typography>
                    {historyError ? (
                      <Alert severity="error">
                        History could not be loaded. Reload the catalogue to
                        retry.
                      </Alert>
                    ) : !history ? (
                      <Typography role="status">Loading history…</Typography>
                    ) : (
                      history.items.map((row) => (
                        <Box key={row.id} sx={{ mb: 2 }}>
                          <Typography fontWeight={700}>
                            Revision {row.revision} ·{" "}
                            {title(row.configuration.state)}
                          </Typography>
                          <Typography variant="body2">
                            {new Date(
                              /(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at)
                                ? row.created_at
                                : `${row.created_at}Z`,
                            ).toLocaleString()}{" "}
                            · Admin ID:{" "}
                            {row.created_by ?? "System or deleted account"}
                          </Typography>
                          <Typography>{row.change_note}</Typography>
                          <Box component="details">
                            <Box component="summary" sx={{ cursor: "pointer" }}>
                              View saved configuration
                            </Box>
                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                              <Typography>
                                Name: {row.configuration.name}
                              </Typography>
                              <Typography>
                                Description:{" "}
                                {row.configuration.description || "None"}
                              </Typography>
                              <Typography>
                                Monthly price: {row.configuration.currency}{" "}
                                {row.configuration.monthly_price}; annual price:{" "}
                                {row.configuration.annual_price === null
                                  ? "Not proposed"
                                  : `${row.configuration.currency} ${row.configuration.annual_price}`}
                              </Typography>
                              <Typography>
                                Subscriber publication:{" "}
                                {row.configuration.subscriber_visible
                                  ? "Published for checkout"
                                  : "Hidden"}
                              </Typography>
                              <Typography>
                                Tax display:{" "}
                                {title(row.configuration.tax_display)}
                              </Typography>
                              {limits.map(([key, label]) => (
                                <Typography key={key}>
                                  {label}: {row.configuration[key]}
                                </Typography>
                              ))}
                              <Typography>
                                Schedule frequencies:{" "}
                                {row.configuration.schedule_frequencies
                                  .map(title)
                                  .join(", ") || "None"}
                              </Typography>
                              <Typography>
                                Email delivery:{" "}
                                {row.configuration.email_delivery
                                  ? "Included"
                                  : "Not included"}
                              </Typography>
                              <Typography sx={{ overflowWrap: "anywhere" }}>
                                Stripe mapping:{" "}
                                {row.configuration.stripe_sandbox
                                  ? `${row.configuration.stripe_sandbox.product_id} · Monthly ${row.configuration.stripe_sandbox.monthly_price_id} · Annual ${row.configuration.stripe_sandbox.annual_price_id ?? "Not mapped"}`
                                  : "Not mapped"}
                              </Typography>
                            </Stack>
                          </Box>
                        </Box>
                      ))
                    )}
                    <Stack direction="row" spacing={1}>
                      <Button
                        disabled={!history || !historyOffset}
                        onClick={() => setHistoryOffset((v) => v - 25)}
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={
                          !history || historyOffset + 25 >= history.total
                        }
                        onClick={() => setHistoryOffset((v) => v + 25)}
                      >
                        Next
                      </Button>
                      <Button onClick={() => setHistoryCode("")}>
                        Close history
                      </Button>
                    </Stack>
                  </Paper>
                )}
                <Paper
                  id="plan-editor"
                  variant="outlined"
                  sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}
                >
                  <Box component="form" onSubmit={save}>
                    <Box
                      component="fieldset"
                      disabled={saving}
                      sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
                    >
                      <Typography variant="h6" gutterBottom>
                        {revision
                          ? `Edit ${code} · based on revision ${revision}`
                          : "Create a draft plan"}
                      </Typography>
                      <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Every save creates a new revision. To retire a plan,
                        choose Archived; its history remains available. Reviewed
                        means internally reviewed, not available for purchase.
                      </Typography>
                      <Box sx={grid}>
                        <TextField
                          required
                          label="Plan code"
                          value={code}
                          disabled={!!revision}
                          onChange={(e) => setCode(e.target.value)}
                          inputProps={{
                            maxLength: 60,
                            pattern: "[a-z][a-z0-9-]{0,59}",
                          }}
                          helperText="Stable identifier: lowercase letters, numbers and hyphens."
                        />
                        <TextField
                          required
                          label="Name"
                          value={form.name}
                          onChange={(e) => update("name", e.target.value)}
                          inputProps={{ maxLength: 100 }}
                        />
                        <TextField
                          select
                          label="Internal state"
                          value={form.state}
                          onChange={(e) => update("state", e.target.value)}
                        >
                          {["draft", "reviewed", "archived"].map((s) => (
                            <MenuItem key={s} value={s}>
                              {title(s)}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          select
                          label="Currency"
                          value={form.currency}
                          onChange={(e) => update("currency", e.target.value)}
                        >
                          {["EUR", "USD", "GBP", "PLN"].map((s) => (
                            <MenuItem key={s} value={s}>
                              {s}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          disabled={form.billing_type === "free"}
                          required
                          type="number"
                          label="Monthly price"
                          value={form.monthly_price}
                          onChange={(e) =>
                            update("monthly_price", e.target.value)
                          }
                          inputProps={{ min: 0, max: 1000000, step: "0.01" }}
                        />
                        <TextField
                          disabled={form.billing_type === "free"}
                          type="number"
                          label="Annual price (optional)"
                          value={form.annual_price ?? ""}
                          onChange={(e) =>
                            update("annual_price", e.target.value || null)
                          }
                          inputProps={{ min: 0, max: 1000000, step: "0.01" }}
                          helperText="Blank means annual billing is not proposed."
                        />
                        <TextField
                          select
                          label="Tax display policy"
                          value={form.tax_display}
                          onChange={(e) =>
                            update("tax_display", e.target.value)
                          }
                        >
                          {["undecided", "inclusive", "exclusive"].map((s) => (
                            <MenuItem key={s} value={s}>
                              {title(s)}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        label="Description"
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                        inputProps={{ maxLength: 1000 }}
                        sx={{ my: 2 }}
                      />
                      <Typography variant="h6" gutterBottom>
                        Subscription allowances
                      </Typography>
                      <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Manual runs are part of the total, not additional runs.
                        Monthly allowances apply to Free and annual paid plans.
                        These limits apply when subscription enforcement is
                        enabled. Paper limits currently support up to 30 per
                        run.
                      </Typography>
                      <Box sx={grid}>
                        {limits.map(([key, label, min, max]) => (
                          <TextField
                            key={key}
                            required
                            type="number"
                            disabled={
                              key === "trial_days" &&
                              form.billing_type === "free"
                            }
                            label={label}
                            value={Number.isNaN(form[key]) ? "" : form[key]}
                            onChange={(e) =>
                              update(
                                key,
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                              )
                            }
                            inputProps={{ min, max, step: 1 }}
                          />
                        ))}
                      </Box>
                      <Typography sx={{ mt: 2 }}>
                        Permitted schedule frequencies (none selected = no
                        scheduling)
                      </Typography>
                      <Stack direction="row" flexWrap="wrap">
                        {frequencies.map((frequency) => (
                          <FormControlLabel
                            key={frequency}
                            label={title(frequency)}
                            control={
                              <Checkbox
                                checked={form.schedule_frequencies.includes(
                                  frequency,
                                )}
                                onChange={(e) =>
                                  update(
                                    "schedule_frequencies",
                                    e.target.checked
                                      ? [
                                          ...form.schedule_frequencies,
                                          frequency,
                                        ]
                                      : form.schedule_frequencies.filter(
                                          (f) => f !== frequency,
                                        ),
                                  )
                                }
                              />
                            }
                          />
                        ))}
                      </Stack>
                      <FormControlLabel
                        label="Publish plan (reviewed, inclusive tax, no trial; paid plans require Stripe mappings)"
                        control={
                          <Checkbox
                            checked={form.subscriber_visible ?? false}
                            onChange={(e) =>
                              update("subscriber_visible", e.target.checked)
                            }
                          />
                        }
                      />
                      <FormControlLabel
                        label="Email delivery included"
                        control={
                          <Checkbox
                            checked={form.email_delivery}
                            onChange={(e) =>
                              update("email_delivery", e.target.checked)
                            }
                          />
                        }
                      />
                      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
                        Billing
                      </Typography>
                      <TextField
                        select
                        label="Billing type"
                        value={form.billing_type ?? "free"}
                        onChange={(e) => {
                          if (e.target.value === "free")
                            setForm((current) => ({
                              ...current,
                              billing_type: "free",
                              monthly_price: "0.00",
                              annual_price: null,
                              stripe_sandbox: null,
                              trial_days: 0,
                              tax_display: "inclusive",
                            }));
                          else {
                            setStripeValid(false);
                            update("billing_type", "stripe");
                          }
                        }}
                        helperText="The reserved code free provides the registration tier. Stripe mappings apply only to paid tiers."
                      >
                        <MenuItem value="stripe">Stripe subscription</MenuItem>
                        <MenuItem value="free">
                          Free — managed by Radar
                        </MenuItem>
                      </TextField>
                      {form.billing_type === "stripe" && (
                        <StripeProductPicker
                          code={code}
                          value={form}
                          onChange={(patch) =>
                            setForm((current) => ({ ...current, ...patch }))
                          }
                          onValidityChange={setStripeValid}
                          refresh={refresh}
                        />
                      )}
                      {form.billing_type === "free" && (
                        <Typography color="text.secondary" sx={{ mt: 1 }}>
                          Managed by Radar with no Stripe product or payment
                          required.
                        </Typography>
                      )}
                      {warningStatus && (
                        <Typography
                          role="status"
                          color="text.secondary"
                          sx={{ mt: 2 }}
                        >
                          {warningStatus}
                        </Typography>
                      )}
                      {warnings.map((warning) => (
                        <Alert key={warning} severity="warning" sx={{ mt: 2 }}>
                          {warning}
                        </Alert>
                      ))}
                      <TextField
                        required
                        fullWidth
                        label="Change note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        inputProps={{ maxLength: 500 }}
                        sx={{ my: 2 }}
                        helperText="Explain this revision for other administrators."
                      />
                      <Stack direction="row" spacing={2}>
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={
                            form.billing_type === "stripe" && !stripeValid
                          }
                        >
                          {saving ? "Saving…" : "Save revision"}
                        </Button>
                        <Button component={Link} to="/admin/subscription-plans">
                          Cancel
                        </Button>
                      </Stack>
                    </Box>
                  </Box>
                </Paper>
              </>
            )
          )}
        </Stack>
      </Container>
    </Box>
  );
}
