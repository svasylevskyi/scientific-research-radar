import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiRequest, ApiError } from '../api/client';

type Schemas = import("../types/api.generated").components["schemas"];
type Price = Schemas["StripePriceRead"];
type Product = Schemas["StripeProductRead"];
type Mapping = Schemas["StripeMappingRead"];
type Value = { stripe_sandbox?: Mapping | null; currency: string; monthly_price: string; annual_price: string | null; tax_display: string };
const label = (p: Price) => `${p.currency} ${p.amount} / ${p.interval === 'month' ? 'month' : 'year'}`;

export function StripeProductPicker({ code, value, onChange, onValidityChange, refresh }: {
  code: string; value: Value; onChange: (patch: Value) => void; onValidityChange: (valid: boolean) => void; refresh: number;
}) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    apiRequest<Schemas["StripeProductsRead"]>('/admin/subscription-plans/stripe-products')
      .then(data => { if (active) setItems(data.items); })
      .catch(e => { if (active) setError(e instanceof ApiError ? e.message : 'Could not load Stripe products.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, refresh]);
  const mapping = value.stripe_sandbox;
  const selected = items.find(p => p.id === mapping?.product_id);
  const ownedElsewhere = (p: Product) => p.mapped_plan_codes.some(c => c !== code);
  const monthly = selected?.prices.find(p => p.id === mapping?.monthly_price_id && p.interval === 'month');
  const annual = selected?.prices.find(p => p.id === mapping?.annual_price_id && p.interval === 'year');
  const valid = !loading && !error && !!selected && !ownedElsewhere(selected) && !!monthly
    && monthly.currency === value.currency && Number(monthly.amount) === Number(value.monthly_price)
    && (value.annual_price === null ? !mapping?.annual_price_id : !!annual && annual.currency === value.currency && Number(annual.amount) === Number(value.annual_price));
  useEffect(() => { onValidityChange(valid); }, [valid, onValidityChange]);
  function choose(product: Product) {
    const candidates = product.prices.filter(p => p.interval === 'month');
    const preferred = candidates.filter(p => p.currency === value.currency);
    const month = preferred.length === 1 ? preferred[0] : candidates.length === 1 ? candidates[0] : undefined;
    const years = product.prices.filter(p => p.interval === 'year' && p.currency === month?.currency);
    const year = years.length === 1 ? years[0] : undefined;
    onChange({ ...value, currency: month?.currency ?? value.currency, monthly_price: month?.amount ?? value.monthly_price,
      annual_price: year?.amount ?? null, tax_display: 'inclusive', stripe_sandbox: {
        product_id: product.id, monthly_price_id: month?.id ?? '', annual_price_id: year?.id ?? null } });
  }
  return <Stack spacing={2} sx={{ my: 2 }}>
    <Typography color="text.secondary">Choose a Stripe product and its prices. Each product belongs to one Radar tier, including its historical revisions. Only supported flat monthly/yearly prices with inclusive tax are offered.</Typography>
    <Button sx={{ alignSelf: 'flex-start' }} disabled={loading} onClick={() => setReload(n => n + 1)}>{loading ? 'Loading Stripe products…' : 'Reload Stripe products'}</Button>
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !error && !items.length && <Alert severity="info">No active products found in the configured Stripe environment.</Alert>}
    <TextField select required fullWidth label="Stripe product" value={selected?.id ?? ''} disabled={loading || !!error}
      onChange={e => { const product = items.find(p => p.id === e.target.value); if (product) choose(product); }}>
      {items.map(p => <MenuItem key={p.id} value={p.id} disabled={ownedElsewhere(p) || !p.prices.some(price => price.interval === 'month')} sx={{ whiteSpace: 'normal' }}>
        <Stack><Typography>{p.name}</Typography><Typography variant="body2">{p.prices.map(label).join(' · ') || 'No supported prices'}{!p.prices.some(price => price.interval === 'year') && ' · No yearly price'}{ownedElsewhere(p) && ` · Mapped to ${p.mapped_plan_codes.filter(c => c !== code).join(', ')}`}</Typography></Stack>
      </MenuItem>)}
    </TextField>
    {!loading && !error && mapping?.product_id && !selected && <Alert severity="warning">The saved product is unavailable. Select an active product before saving a new revision.</Alert>}
    {selected && <>
      <TextField select required label="Monthly Stripe price" value={monthly?.id ?? ''} onChange={e => {
        const price = selected.prices.find(p => p.id === e.target.value)!;
        const keepYear = annual?.currency === price.currency ? annual : undefined;
        onChange({ ...value, currency: price.currency, monthly_price: price.amount, annual_price: keepYear?.amount ?? null,
          stripe_sandbox: { product_id: selected.id, monthly_price_id: price.id, annual_price_id: keepYear?.id ?? null } });
      }}>{selected.prices.filter(p => p.interval === 'month').map(p => <MenuItem key={p.id} value={p.id}>{label(p)} · {p.id}</MenuItem>)}</TextField>
      <TextField select label="Yearly Stripe price" value={annual?.id ?? ''} onChange={e => {
        const price = selected.prices.find(p => p.id === e.target.value);
        onChange({ ...value, annual_price: price?.amount ?? null, stripe_sandbox: { ...mapping!, annual_price_id: price?.id ?? null } });
      }}><MenuItem value="">No yearly billing</MenuItem>{selected.prices.filter(p => p.interval === 'year' && p.currency === value.currency).map(p => <MenuItem key={p.id} value={p.id}>{label(p)} · {p.id}</MenuItem>)}</TextField>
      {!valid && !loading && !error && <Alert severity="warning">Select available prices matching the plan’s currency and amounts. Products mapped to another tier cannot be saved.</Alert>}
    </>}
  </Stack>;
}
