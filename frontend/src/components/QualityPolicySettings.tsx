import { Alert, Divider, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { QualityConfig } from "../api/researchQuality";
import { ClaimReviewSettings, defaultClaimReview } from "./ClaimReviewSettings";

const localRules = [
  ["check_reporting_dates", "Check publication dates against the reporting period"],
  ["check_duplicates", "Check for duplicate DOIs, source URLs, and titles"],
  ["check_source_access", "Check reported source access and summary basis"],
] as const;

function SettingsGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Stack component="fieldset" spacing={2} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
    <Typography component="legend" variant="h6" sx={{ mb: 1 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary">{description}</Typography>
    {children}
  </Stack>;
}

export function QualityPolicySettings({ config, onChange, editable, threshold, setThreshold, thresholdValid }: {
  config: QualityConfig; onChange: (config: QualityConfig) => void; editable: boolean;
  threshold: string; setThreshold: (value: string) => void; thresholdValid: boolean;
}) {
  return <Stack spacing={3} divider={<Divider />}>
    <SettingsGroup title="Automatic checks and delivery" description="Choose whether new runs are checked and whether serious findings block automatic email. Saving settings runs no checks and makes no external or LLM requests.">
      <TextField select label="Quality gate mode" value={config.mode} disabled={!editable}
        onChange={event => onChange({ ...config, mode: event.target.value as QualityConfig["mode"] })}>
        <MenuItem value="off">Off — do not evaluate new runs</MenuItem>
        <MenuItem value="observe">Observe — record findings without blocking delivery</MenuItem>
        <MenuItem value="enforce">Enforce — block delivery of held output</MenuItem>
      </TextField>
      {config.mode === "enforce" && <Alert severity="warning">Held output cannot be emailed. Generated runs still count against allowances; agree the customer allowance policy before enabling Enforce for paying users.</Alert>}
      <Typography variant="body2">Each run keeps its original settings, including retries. Changes never release held output or re-evaluate earlier runs. Admins can still request local checks when automatic checks are Off.</Typography>
    </SettingsGroup>
    <SettingsGroup title="Structural checks" description="Local checks of saved output. No external services or LLM charges. Manual local checks use the current rules.">
      {localRules.map(([key, label]) => <FormControlLabel key={key} label={label} control={<Switch checked={!!config[key]} disabled={!editable} onChange={(_, checked) => onChange({ ...config, [key]: checked })} />} />)}
      <TextField label="Warn when fewer papers are selected" type="number" value={threshold} disabled={!editable}
        onChange={event => setThreshold(event.target.value)} error={!thresholdValid}
        helperText="0–30. Set 0 to disable this warning. Sparse results never cause a hold by themselves."
        slotProps={{ htmlInput: { min: 0, max: 30, step: 1 } }} />
      <Typography variant="body2">Required content, selected-paper coverage, and reference consistency are always checked in Observe and Enforce. Existing schema, security, and reference-integrity validation remains active even when quality gates are Off.</Typography>
    </SettingsGroup>
    <SettingsGroup title="Source verification" description="External Crossref/arXiv metadata requests, without OpenAI charges. These verify paper identity and metadata, not scientific claims.">
      <TextField select label="Independent source verification" value={config.source_verification_mode ?? "observe"} disabled={!editable}
        onChange={event => onChange({ ...config, source_verification_mode: event.target.value as QualityConfig["source_verification_mode"] })}>
        <MenuItem value="off">Off — disable independent metadata checks</MenuItem>
        <MenuItem value="observe">Observe — record metadata limitations as warnings</MenuItem>
        <MenuItem value="enforce">Enforce — confirmed metadata conflicts cause Hold</MenuItem>
      </TextField>
      <Typography variant="body2">Conflicts block delivery only when both this setting and the quality gate are Enforce. Unavailable providers produce warnings. Automatic metadata checks are skipped when the quality gate is Off; manual verification remains available unless source verification is Off.</Typography>
    </SettingsGroup>
    <SettingsGroup title="Evidence availability" description="Inspect saved source text and passage references locally. Reading or refreshing saved evidence makes no external requests or LLM calls.">
      <FormControlLabel label="Warn about missing source content or evidence links (observation only)" control={<Switch checked={!!config.check_evidence_links} disabled={!editable} onChange={(_, checked) => onChange({ ...config, check_evidence_links: checked })} />} />
      <Typography variant="body2">New research runs retrieve permitted content separately using external services. Reuse permissions remain mandatory even with quality checks Off. This switch only controls evidence warnings; it never disables permission checks or retrieval.</Typography>
    </SettingsGroup>
    <ClaimReviewSettings value={config.claim_review ?? defaultClaimReview} disabled={!editable} onChange={value => onChange({ ...config, claim_review: value })} />
  </Stack>;
}
