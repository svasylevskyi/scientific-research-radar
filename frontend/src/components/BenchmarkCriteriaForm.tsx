import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { benchmarkApi, type BenchmarkDetail, type CriteriaWrite } from "../api/benchmarkReview";

const fields = [
  ["minimum_reviewed_cases", "Minimum reviewed cases", 1, 10000, 1],
  ["minimum_source_families", "Minimum real-paper families", 1, 500, 1],
  ["minimum_prediction_coverage", "Minimum verdict coverage (0–1)", 0, 1, 0.01],
  ["minimum_accuracy", "Minimum accuracy (0–1)", 0, 1, 0.01],
  ["maximum_false_acceptance_rate", "Maximum false acceptance rate (0–1)", 0, 1, 0.01],
  ["maximum_regressions", "Maximum regressions", 0, 10000, 1],
] as const;

export function BenchmarkCriteriaForm({ data, editable, blocked, onSaved, onDirty, onSaving }: {
  data: BenchmarkDetail; editable: boolean; blocked: boolean;
  onSaved: (value: BenchmarkDetail) => void; onDirty: (value: boolean) => void; onSaving: (value: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(data);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(data.criteria[key] ?? "")])));
  const [status, setStatus] = useState<"draft" | "approved">(data.criteria.status ?? "draft");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const dirty = !!reason || status !== baseline.criteria.status || fields.some(([key]) => values[key] !== String(baseline.criteria[key] ?? ""));
  useEffect(() => {
    if (dirty) return;
    setBaseline(data);
    setValues(Object.fromEntries(fields.map(([key]) => [key, String(data.criteria[key] ?? "")])));
    setStatus(data.criteria.status ?? "draft");
  }, [data, dirty]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const valid = fields.every(([key, , min, max, step]) => values[key]?.trim() && Number.isFinite(Number(values[key])) &&
    Number(values[key]) >= min && Number(values[key]) <= max && (step !== 1 || Number.isInteger(Number(values[key]))));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editable || blocked || saving || pending.current || !valid || !reason.trim()) return;
    pending.current = true; setSaving(true); onSaving(true); setError("");
    const thresholds = Object.fromEntries(fields.map(([key]) => [key, Number(values[key])]));
    try { onSaved(await benchmarkApi.saveCriteria(data.summary.id, { ...thresholds, expected_revision: baseline.summary.revision, status, reason } as CriteriaWrite)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Criteria could not be saved."); }
    finally { pending.current = false; setSaving(false); onSaving(false); }
  }
  return <Stack component="form" onSubmit={save} spacing={2}>
    <Typography variant="body2">These thresholds judge benchmark comparisons, not live digest delivery. Critical false acceptance and invalid required references always fail. Only super-admins can change or approve criteria.</Typography>
    {fields.map(([key, label, min, max, step]) => <TextField key={key} label={label} type="number" value={values[key]}
      disabled={!editable || blocked || saving} slotProps={{ htmlInput: { min, max, step } }}
      onChange={event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setStatus("draft"); }} />)}
    <TextField select label="Criteria status" value={status} disabled={!editable || blocked || saving}
      onChange={event => setStatus(event.target.value as "draft" | "approved")}>
      <MenuItem value="draft">Draft</MenuItem><MenuItem value="approved">Approved for benchmark evaluation</MenuItem>
    </TextField>
    {editable && <><TextField label="Reason for criteria change or approval" multiline required minRows={2} value={reason}
      disabled={blocked || saving} slotProps={{ htmlInput: { maxLength: 2000 } }} onChange={event => setReason(event.target.value)} />
      {error && <Alert severity="error">{error}</Alert>}
      <Button type="submit" variant="contained" sx={{ alignSelf: "flex-start" }} disabled={blocked || saving || !valid || !reason.trim()}>
        {saving ? "Saving…" : "Save criteria"}</Button></>}
  </Stack>;
}
