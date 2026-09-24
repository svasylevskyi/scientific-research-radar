import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { apiRequest, ApiError } from "../api/client";
import { blank, rates, type PriceInput, type Price } from "../admin/pricing";

type CreatedPrice = import("../types/api-contracts").ApiResponse<"/api/v1/admin/pricing", "post">;

export function AdminPricingEditPage() {
  const { priceId } = useParams();
  return <PricingEditor key={priceId ?? "new"} priceId={priceId} />;
}
function PricingEditor({ priceId }: { priceId?: string }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<PriceInput>(blank);
  const [source, setSource] = useState<Price | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!priceId);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!priceId) return;
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<Price>(`/admin/pricing/${encodeURIComponent(priceId)}`)
      .then((row) => {
        if (!active) return;
        setSource(row);
        setForm({
          model_name: row.model_name,
          version: "",
          input_per_million: row.input_per_million,
          cached_input_per_million: row.cached_input_per_million,
          cache_write_per_million: row.cache_write_per_million ?? "",
          output_per_million: row.output_per_million,
          web_search_per_call: row.web_search_per_call,
          max_input_tokens: String(row.max_input_tokens),
        });
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Could not load this pricing version.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [priceId, reload]);
  function update(field: keyof PriceInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest<CreatedPrice>("/admin/pricing", {
        method: "POST",
        body: {
          ...form,
          cache_write_per_million: form.cache_write_per_million || null,
          max_input_tokens: Number(form.max_input_tokens),
        },
      });
      navigate("/admin/pricing", { state: { published: true } });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save pricing.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Button component={RouterLink} to="/admin/pricing" sx={{ mb: 2 }}>
          Back to pricing
        </Button>
        <Typography component="h1" variant="h3" gutterBottom>
          New pricing version
        </Typography>
        {source && (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Based on {source.model_name} · {source.version}. The original
            version remains unchanged.
          </Typography>
        )}
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              priceId &&
              !source && (
                <Button
                  color="inherit"
                  disabled={loading}
                  onClick={() => setReload((v) => v + 1)}
                >
                  Retry
                </Button>
              )
            }
          >
            {error}
          </Alert>
        )}
        {loading ? (
          <Typography role="status">Loading pricing version…</Typography>
        ) : (
          (!priceId || source) && (
            <>
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                <Box component="form" id="pricing-form" onSubmit={save}>
                  <Typography variant="h6" gutterBottom>
                    Publish a pricing version
                  </Typography>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    Use the exact model ID and a new version label. Saving makes
                    this the current tariff for that model immediately,
                    including new requests in an ongoing run. Verify the rates
                    with OpenAI before saving.
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 2,
                    }}
                  >
                    <TextField
                      required
                      label="Model ID"
                      value={form.model_name}
                      onChange={(e) => update("model_name", e.target.value)}
                      inputProps={{ maxLength: 100 }}
                      disabled={saving}
                    />
                    <TextField
                      required
                      label="Version label"
                      placeholder="2026-09-09-standard-v1"
                      value={form.version}
                      onChange={(e) => update("version", e.target.value)}
                      inputProps={{ maxLength: 100 }}
                      disabled={saving}
                    />
                    {rates.map(([key, label]) => (
                      <TextField
                        key={key}
                        required={key !== "cache_write_per_million"}
                        label={`${label} (USD)`}
                        type="number"
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                        inputProps={{ min: 0, step: "any" }}
                        disabled={saving}
                      />
                    ))}
                    <TextField
                      required
                      label="Maximum input tokens covered"
                      type="number"
                      value={form.max_input_tokens}
                      onChange={(e) =>
                        update("max_input_tokens", e.target.value)
                      }
                      inputProps={{ min: 1, max: 2147483647, step: 1 }}
                      disabled={saving}
                      helperText="Larger requests remain unpriced."
                    />
                  </Box>
                  <Alert severity="info" sx={{ my: 2 }}>
                    These are flat standard-tier estimates. Special tariffs and
                    unsupported service tiers remain unpriced. Requests with
                    cache writes need a cache-write rate; leaving it blank does
                    not mean zero. This does not change OpenAI billing or set a
                    spending limit.
                  </Alert>
                  <Stack direction="row" spacing={2}>
                    <Button type="submit" variant="contained" disabled={saving}>
                      {saving ? "Saving…" : "Save pricing version"}
                    </Button>
                    <Button
                      disabled={saving}
                      component={RouterLink}
                      to="/admin/pricing"
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            </>
          )
        )}
      </Container>
    </Box>
  );
}
