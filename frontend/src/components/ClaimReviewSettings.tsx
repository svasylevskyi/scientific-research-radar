import { Alert, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { ClaimReviewConfig } from "../api/claimReviews";

export const defaultClaimReview: ClaimReviewConfig = { mode: "off", model: "gpt-6-astra", max_claims: 40,
  max_output_tokens: 1500, max_review_usd: "1", daily_budget_usd: "5", daily_call_limit: 100 };

export function ClaimReviewSettings({ value, disabled, onChange }: {
  value: ClaimReviewConfig; disabled: boolean; onChange: (value: ClaimReviewConfig) => void;
}) {
  return <Stack component="fieldset" spacing={2} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
    <Typography component="legend" variant="h6">AI observations · Paid reviews</Typography>
    <Typography variant="body2" color="text.secondary">Optional, manually requested reviews of saved evidence. These add paid OpenAI calls and never change delivery, human labels, or subscriber allowances. The main quality gate mode does not enable or disable this separate reviewer.</Typography>
    <TextField select label="AI reviewer mode" value={value.mode ?? "off"} disabled={disabled}
      onChange={event => onChange({ ...value, mode: event.target.value as ClaimReviewConfig["mode"] })}>
      <MenuItem value="off">Off — do not allow AI reviews</MenuItem>
      <MenuItem value="observe">Observe — allow manual AI reviews</MenuItem>
    </TextField>
    <TextField required label="Reviewer model" value={value.model ?? ""} disabled={disabled}
      onChange={event => onChange({ ...value, model: event.target.value })}
      helperText="Use a Responses API model supporting structured output and low reasoning effort. Publish its standard pricing in Admin Pricing first." />
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField required fullWidth type="number" label="Maximum claims per review" value={value.max_claims} disabled={disabled}
        onChange={event => onChange({ ...value, max_claims: Number(event.target.value) })} slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }} />
      <TextField required fullWidth type="number" label="Output tokens per claim" value={value.max_output_tokens} disabled={disabled}
        onChange={event => onChange({ ...value, max_output_tokens: Number(event.target.value) })} slotProps={{ htmlInput: { min: 500, max: 4000, step: 1 } }} />
    </Stack>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField required fullWidth type="number" label="Maximum USD per review" value={value.max_review_usd} disabled={disabled}
        onChange={event => onChange({ ...value, max_review_usd: event.target.value })} slotProps={{ htmlInput: { min: 0.000001, max: 20, step: "any" } }} />
      <TextField required fullWidth type="number" label="Daily USD reservation budget" value={value.daily_budget_usd} disabled={disabled}
        onChange={event => onChange({ ...value, daily_budget_usd: event.target.value })} slotProps={{ htmlInput: { min: 0.000001, max: 100, step: "any" } }} />
      <TextField required fullWidth type="number" label="Daily call limit" value={value.daily_call_limit} disabled={disabled}
        onChange={event => onChange({ ...value, daily_call_limit: Number(event.target.value) })} slotProps={{ htmlInput: { min: 1, max: 500, step: 1 } }} />
    </Stack>
    <Alert severity="info">Budgets reserve a conservative estimate using your configured prices; reservations reset at midnight UTC and are retained even when a request fails. One review runs at a time. Switching Off stops further submissions; an in-flight call may finish.</Alert>
  </Stack>;
}
