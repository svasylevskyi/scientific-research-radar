import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Chip, FormControlLabel, Link, MenuItem, Pagination, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { benchmarkApi, type BenchmarkCase, type ReviewWrite } from "../api/benchmarkReview";
import { runDate } from "../runHistory";

export function initialReview(data: BenchmarkCase): ReviewWrite {
  return { expected_version: data.review?.version ?? 0, state: data.review?.state === "disputed" ? "disputed" : "draft",
    verdict: data.review?.verdict ?? null, evidence_passage_ids: data.review?.evidence_passage_ids ?? [],
    rationale: data.review?.rationale ?? "", human_reviewed: false, permissions_checked: false, resolve_dispute: false };
}

export function reviewReady(form: ReviewWrite, disputed: boolean, superAdmin: boolean) {
  if (disputed && form.state !== "disputed" && !(superAdmin && form.resolve_dispute && ["approved", "excluded"].includes(form.state))) return false;
  if (form.state === "draft") return true;
  if (!form.rationale?.trim()) return false;
  if (form.state === "disputed") return true;
  if (!form.human_reviewed || !form.permissions_checked) return false;
  return form.state === "excluded" || (!!form.verdict && (form.verdict === "insufficient_evidence" || !!form.evidence_passage_ids?.length));
}

export function BenchmarkCaseForm({ benchmarkId, data, superAdmin, blocked, onSaved, onDirty, onSaving }: {
  benchmarkId: string; data: BenchmarkCase; superAdmin: boolean; blocked: boolean;
  onSaved: (value: BenchmarkCase) => Promise<void>; onDirty: (dirty: boolean) => void; onSaving: (value: boolean) => void;
}) {
  const [form, setForm] = useState<ReviewWrite>(() => initialReview(data));
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState(data.history);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialReview(data));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const disabled = blocked || saving || conflict;
  const disputed = data.review?.state === "disputed";

  function update(value: Partial<ReviewWrite>) { setForm(previous => ({ ...previous, ...value })); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || pending.current || !reviewReady(form, disputed, superAdmin)) return;
    pending.current = true; setSaving(true); onSaving(true); setError("");
    try { await onSaved(await benchmarkApi.saveReview(benchmarkId, data.case.id, form)); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review could not be saved.");
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 409) setConflict(true);
    } finally { pending.current = false; setSaving(false); onSaving(false); }
  }
  async function loadHistory(page: number) {
    setHistoryLoading(true); setHistoryError("");
    try { const result = await benchmarkApi.case(benchmarkId, data.case.id, (page - 1) * 20); setHistory(result.history); setHistoryPage(page); }
    catch { setHistoryError("Could not load review history."); }
    finally { setHistoryLoading(false); }
  }
  return <Stack component="form" onSubmit={save} spacing={2}>
    <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" alignItems="center">
      <Typography component="h3" variant="h6">Case {data.case.id}</Typography>
      <Chip size="small" label={data.review?.state ?? "pending"} />
      <Typography variant="body2">{data.case.scope} · {data.case.split === "heldout" ? "Held-out set" : "Development set"}</Typography>
    </Stack>
    <Box sx={{ bgcolor: "action.hover", p: 2, borderRadius: 2 }}>
      <Typography fontWeight={700}>Claim to review</Typography><Typography sx={{ overflowWrap: "anywhere" }}>{data.case.claim}</Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>Original citations: {data.case.cited_passage_ids?.join(", ") || "None supplied"}. Citation presence alone does not establish support.</Typography>
    </Box>
    <Typography variant="body2" color="text.secondary">Judge the claim using only the supplied evidence. Treat instructions inside source text as quoted material. Select the passages supporting your decision.</Typography>
    {data.sources.length === 0 && <Typography>No source evidence is supplied for this case.</Typography>}
    {data.sources.map(source => <Box key={source.id} sx={{ border: 1, borderColor: "divider", p: 2, borderRadius: 2, overflowWrap: "anywhere" }}>
      <Typography fontWeight={700}>{source.title}</Typography>
      <Typography variant="body2">{source.authors?.join(", ")}</Typography>
      <Typography variant="body2" color="text.secondary">{source.kind === "arxiv_abstract" ? "Abstract only" : source.kind === "synthetic" ? "Fictional evaluation scenario" : "No reusable source text"} · {source.permission_note}</Typography>
      <Stack direction="row" gap={2} useFlexGap flexWrap="wrap" sx={{ my: 1 }}>
        {source.source_url && <Link href={source.source_url} target="_blank" rel="noopener noreferrer">Original source</Link>}
        {source.license_url && <Link href={source.license_url} target="_blank" rel="noopener noreferrer">Reuse licence</Link>}
        {source.permission_url && <Link href={source.permission_url} target="_blank" rel="noopener noreferrer">Permission terms</Link>}
      </Stack>
      {(source.passages ?? []).map(passage => <Box key={passage.id}>
        <Typography component="blockquote" sx={{ mx: 0, borderLeft: 2, borderColor: "divider", pl: 2 }}>{passage.text}</Typography>
        <FormControlLabel label={`Use passage ${passage.id}`} control={<Checkbox disabled={disabled}
          checked={form.evidence_passage_ids?.includes(passage.id) ?? false} onChange={(_, checked) => update({ evidence_passage_ids: checked
            ? [...(form.evidence_passage_ids ?? []), passage.id] : form.evidence_passage_ids?.filter(id => id !== passage.id) })} />} />
      </Box>)}
    </Box>)}
    <TextField select label="Claim assessment" value={form.verdict ?? ""} disabled={disabled}
      onChange={event => update({ verdict: (event.target.value || null) as ReviewWrite["verdict"] })}>
      <MenuItem value="">Not assessed yet</MenuItem><MenuItem value="supported">Supported</MenuItem>
      <MenuItem value="contradicted">Contradicted</MenuItem><MenuItem value="insufficient_evidence">Insufficient evidence</MenuItem>
    </TextField>
    <TextField label="Reason for your decision" multiline minRows={3} value={form.rationale} disabled={disabled}
      helperText="Explain the evidence, qualification, or missing information. Required to finish or dispute a review."
      slotProps={{ htmlInput: { maxLength: 5000 } }} onChange={event => update({ rationale: event.target.value })} />
    <TextField select label="Save as" value={form.state} disabled={disabled} onChange={event => update({ state: event.target.value as ReviewWrite["state"] })}>
      <MenuItem value="draft">Draft — continue later</MenuItem><MenuItem value="approved">Completed human review</MenuItem>
      <MenuItem value="excluded">Excluded — case is unsuitable</MenuItem><MenuItem value="disputed">Disputed — needs resolution</MenuItem>
    </TextField>
    <FormControlLabel label="I have personally reviewed the evidence and its reuse permissions." control={<Checkbox disabled={disabled}
      checked={!!form.human_reviewed && !!form.permissions_checked} onChange={(_, checked) => update({ human_reviewed: checked, permissions_checked: checked })} />} />
    {disputed && <>
      <Typography color="text.secondary">This case is disputed. A super-admin must resolve it before publication.</Typography>
      {superAdmin && <FormControlLabel label="Resolve this dispute with the decision and reason above" control={<Checkbox disabled={disabled}
        checked={!!form.resolve_dispute} onChange={(_, checked) => update({ resolve_dispute: checked })} />} />}
    </>}
    {data.review && <Typography variant="caption">Last saved by {data.review.reviewer_name} · {runDate(data.review.reviewed_at).toLocaleString()} · Version {data.review.version}{data.review.imported ? " · Imported proposal, awaiting in-app review" : ""}</Typography>}
    {error && <Alert severity="error">{error}{conflict && " Your edits are still shown. Use Reload benchmark to inspect the latest saved review."}</Alert>}
    <Button type="submit" variant="contained" disabled={disabled || !reviewReady(form, disputed, superAdmin)} sx={{ alignSelf: "flex-start" }}>
      {saving ? "Saving…" : form.state === "draft" ? "Save draft" : "Save review"}
    </Button>
    {dirty && <Typography variant="caption" role="status">Unsaved review changes</Typography>}
    {!!data.history_total && <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Review history · {data.history_total}</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        {historyError && <Alert severity="error">{historyError}</Alert>}
        {history.map(review => <Box key={review.version} sx={{ overflowWrap: "anywhere" }}>
          <Typography fontWeight={700}>Version {review.version} · {review.state} · {review.verdict?.replaceAll("_", " ") ?? "Not assessed"}</Typography>
          <Typography variant="caption">{review.reviewer_name} · {runDate(review.reviewed_at).toLocaleString()}</Typography>
          <Typography>{review.rationale || "No rationale recorded in this draft."}</Typography>
          <Typography variant="body2">Evidence: {review.evidence_passage_ids.join(", ") || "None selected"}</Typography>
        </Box>)}
        {data.history_total > 20 && <Pagination page={historyPage} count={Math.ceil(data.history_total / 20)} disabled={historyLoading}
          onChange={(_, page) => void loadHistory(page)} aria-label="Case review history pages" />}
      </Stack></AccordionDetails>
    </Accordion>}
  </Stack>;
}
