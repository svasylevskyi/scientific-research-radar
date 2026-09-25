import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Checkbox, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { benchmarkApi, downloadJson, type BenchmarkAudit, type BenchmarkCase, type BenchmarkDetail, type BenchmarkSummary } from "../api/benchmarkReview";
import { runDate } from "../runHistory";
import { BenchmarkCaseForm } from "./BenchmarkCaseForm";
import { BenchmarkCriteriaForm } from "./BenchmarkCriteriaForm";

export function BenchmarkReviewPanel({ standalone = false }: { standalone?: boolean }) {
  const [opened, setOpened] = useState(false);
  const introduction = <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Review shared calibration cases against their permitted evidence. These cases are separate from the selected digest run. No LLM calls are made; reviews do not change run quality, delivery, or allowances.</Typography>;
  if (standalone) return <Box>
    <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Human benchmark review</Typography>
    {introduction}
    <BenchmarkReviewWorkspace />
  </Box>;
  return <Accordion onChange={(_, expanded) => { if (expanded) setOpened(true); }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography component="h2" variant="h6">Human benchmark review</Typography></AccordionSummary>
    <AccordionDetails>
      {introduction}
      {opened && <BenchmarkReviewWorkspace />}
    </AccordionDetails>
  </Accordion>;
}

export function BenchmarkReviewWorkspace() {
  const { user } = useAuth();
  const superAdmin = !!user?.is_super_admin;
  const [catalog, setCatalog] = useState<BenchmarkSummary[]>([]);
  const [benchmarkId, setBenchmarkId] = useState("");
  const [data, setData] = useState<BenchmarkDetail | null>(null);
  const [caseId, setCaseId] = useState("");
  const [caseData, setCaseData] = useState<BenchmarkCase | null>(null);
  const [split, setSplit] = useState("development");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [caseLoading, setCaseLoading] = useState(false);
  const [operationBusy, setBusy] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const busy = operationBusy || caseSaving || criteriaSaving;
  const [error, setError] = useState("");
  const [caseError, setCaseError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [caseDirty, setCaseDirty] = useState(false);
  const [criteriaDirty, setCriteriaDirty] = useState(false);
  const [criteriaSaved, setCriteriaSaved] = useState(0);
  const dirty = caseDirty || criteriaDirty;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const markCaseDirty = useCallback((value: boolean) => setCaseDirty(value), []);
  const markCriteriaDirty = useCallback((value: boolean) => setCriteriaDirty(value), []);
  const [audit, setAudit] = useState<BenchmarkAudit | null>(null);
  const [auditPage, setAuditPage] = useState(0);
  const [reason, setReason] = useState("");
  const [importPermission, setImportPermission] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } }
    function beforeLink(event: MouseEvent) {
      if (!dirtyRef.current || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && !link.download && link.target !== "_blank" && !link.getAttribute("href")?.startsWith("#") && !window.confirm("Leave without saving your benchmark changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", beforeLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeLink, true); };
  }, []);
  const mayDiscard = () => !dirtyRef.current || window.confirm("Discard unsaved benchmark changes?");
  const mayChangeCase = () => !caseDirty || window.confirm("Discard unsaved review changes?");

  useEffect(() => {
    let active = true; setLoading(true); setError("");
    benchmarkApi.list().then(items => {
      if (!active) return;
      setCatalog(items); setBenchmarkId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? "");
      if (!items.length) setLoading(false);
    }).catch(caught => { if (active) { setError(caught instanceof Error ? caught.message : "Could not load benchmarks."); setLoading(false); } });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!benchmarkId) return;
    let active = true; setLoading(true); setError(""); setData(null); setCaseData(null); setAudit(null); setAuditPage(0); setReason("");
    benchmarkApi.detail(benchmarkId).then(value => {
      if (!active) return;
      setData(value); setCaseId(previous => value.cases.some(item => item.id === previous) ? previous : value.cases[0]?.id ?? "");
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "Could not load benchmark."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [benchmarkId, reload]);

  const cases = data?.cases.filter(item => (split === "all" || item.split === split) && (filter === "all" || item.state === filter)) ?? [];
  const selectedCase = cases.some(item => item.id === caseId) ? caseId : cases[0]?.id ?? "";
  useEffect(() => {
    if (!benchmarkId || !selectedCase) { setCaseData(null); setCaseLoading(false); setCaseError(""); return; }
    let active = true; setCaseLoading(true); setCaseError(""); setCaseData(null);
    benchmarkApi.case(benchmarkId, selectedCase).then(value => { if (active) setCaseData(value); })
      .catch(caught => { if (active) setCaseError(caught instanceof Error ? caught.message : "Could not load case."); })
      .finally(() => { if (active) setCaseLoading(false); });
    return () => { active = false; };
  }, [benchmarkId, selectedCase, reload]);

  async function refreshDetail() { if (benchmarkId) setData(await benchmarkApi.detail(benchmarkId)); }
  async function perform(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Benchmark action failed."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function savedCase(value: BenchmarkCase) {
    setNotice(value.review?.state === "disputed" ? "Review saved as disputed. A super-admin must resolve it." : `Review saved as ${value.review?.state}.`);
    try { await refreshDetail(); } catch { setError("Review saved, but the benchmark summary could not refresh. Reload before making further changes."); }
    setCaseData(value); setCaseDirty(false);
  }
  const blocked = loading || busy || !!error;
  const exportFile = (publication?: number) => perform(async () => {
    const bundle = await benchmarkApi.export(benchmarkId, publication);
    downloadJson(`radar-benchmark-${publication ? `published-${publication}` : "working"}.json`, bundle);
  });
  const loadAudit = (page: number) => perform(async () => { setAudit(await benchmarkApi.history(benchmarkId, page * 20)); setAuditPage(page); });
  const importFile = (file: File | undefined, kind: "benchmark" | "reviews") => {
    if (!file || !mayDiscard()) return;
    void perform(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error("Choose a JSON file smaller than 2 MiB.");
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Choose a benchmark or review JSON object.");
      const value = kind === "benchmark" ? await benchmarkApi.importBenchmark(parsed.benchmark ?? parsed)
        : await benchmarkApi.importReviews(benchmarkId, data!.summary.revision, parsed.reviews ?? parsed);
      setCatalog(current => [value.summary, ...current.filter(item => item.id !== value.summary.id)]);
      setBenchmarkId(value.summary.id); setCaseDirty(false); setCriteriaDirty(false); setReload(previous => previous + 1);
      setNotice(kind === "benchmark" ? "Benchmark imported. All cases require human review." : "Review proposals imported as drafts. Complete and confirm them in the form.");
    });
  };

  return <Stack spacing={2}>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
      {!!catalog.length && <TextField select fullWidth label="Benchmark" value={benchmarkId} disabled={busy || loading}
        onChange={event => { if (mayDiscard()) { setBenchmarkId(event.target.value); setCaseId(""); setSplit("development"); setFilter("all"); setNotice(""); } }}>
        {catalog.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · {item.version}</MenuItem>)}
      </TextField>}
      <Button disabled={busy || loading} onClick={() => { if (mayDiscard()) { setCaseDirty(false); setCriteriaDirty(false); setReload(value => value + 1); setNotice(""); } }}>Reload benchmark</Button>
    </Stack>
    {loading && <CircularProgress aria-label="Loading benchmark" />}
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success" role="status">{notice}</Alert>}
    {!loading && !catalog.length && !error && <Typography>No benchmarks are available. A super-admin can import one below.</Typography>}
    {data && <>
      <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
        {Object.entries(data.summary.counts).map(([state, count]) => <Chip key={state} size="small" variant="outlined" label={`${state}: ${count}`} />)}
      </Stack>
      <Typography variant="body2" color="text.secondary">{data.description}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField select fullWidth label="Dataset split" value={split} disabled={busy} onChange={event => { if (mayChangeCase()) { setSplit(event.target.value); setCaseId(""); } }}>
          <MenuItem value="development">Development</MenuItem><MenuItem value="heldout">Held-out</MenuItem><MenuItem value="all">All cases</MenuItem>
        </TextField>
        <TextField select fullWidth label="Review status" value={filter} disabled={busy} onChange={event => { if (mayChangeCase()) { setFilter(event.target.value); setCaseId(""); } }}>
          {["all", "pending", "draft", "approved", "excluded", "disputed"].map(state => <MenuItem key={state} value={state}>{state === "all" ? "All statuses" : state}</MenuItem>)}
        </TextField>
      </Stack>
      {!!cases.length && <TextField select label="Case" value={selectedCase} disabled={busy || caseLoading} onChange={event => { if (mayChangeCase()) setCaseId(event.target.value); }}>
        {cases.map(item => <MenuItem key={item.id} value={item.id} sx={{ whiteSpace: "normal" }}>{item.id} · {item.state} · {item.claim.slice(0, 90)}</MenuItem>)}
      </TextField>}
      {!cases.length && <Typography>No cases match these filters.</Typography>}
      {caseLoading && <CircularProgress aria-label="Loading review case" />}
      {caseError && <Alert severity="error">{caseError}</Alert>}
      {caseData && caseData.case.id === selectedCase && <BenchmarkCaseForm key={`${benchmarkId}:${caseData.case.id}:${caseData.review?.version ?? 0}`} benchmarkId={benchmarkId}
        data={caseData} superAdmin={superAdmin} blocked={blocked || !!caseError} onDirty={markCaseDirty} onSaved={savedCase} onSaving={setCaseSaving} />}
      <Accordion><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Evaluation criteria · {data.criteria.status}</Typography></AccordionSummary>
        <AccordionDetails><BenchmarkCriteriaForm key={`${benchmarkId}:${criteriaSaved}`} data={data} editable={superAdmin}
          blocked={blocked} onDirty={markCriteriaDirty} onSaving={setCriteriaSaving} onSaved={value => { setData(value); setCriteriaSaved(count => count + 1); setCriteriaDirty(false); setAudit(null); setNotice("Evaluation criteria saved."); }} /></AccordionDetails>
      </Accordion>
      <Accordion onChange={(_, expanded) => { if (expanded && !audit) void loadAudit(0); }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Publication and history</Typography></AccordionSummary>
        <AccordionDetails><Stack spacing={2}>
          <Typography variant="body2">Publishing freezes the reviewed labels and approved criteria for repeatable comparisons. It does not certify scientific accuracy or change live digest delivery.</Typography>
          <Typography>{data.summary.latest_publication ? `Latest published revision: ${data.summary.latest_publication}.` : "No published revisions yet."} {data.summary.unpublished_changes ? "Working changes are not published." : "Working reviews match the latest publication."}</Typography>
          {superAdmin && <>
            <TextField label="Reason for publication" multiline minRows={2} value={reason} disabled={blocked} slotProps={{ htmlInput: { maxLength: 2000 } }} onChange={event => setReason(event.target.value)} />
            <Button variant="contained" sx={{ alignSelf: "flex-start" }} disabled={blocked || dirty || !reason.trim() || data.criteria.status !== "approved" ||
              !data.summary.counts.approved || !!((data.summary.counts.pending ?? 0) + (data.summary.counts.draft ?? 0) + (data.summary.counts.disputed ?? 0)) || !data.summary.unpublished_changes}
              onClick={() => void perform(async () => { const published = await benchmarkApi.publish(benchmarkId, data.summary.revision, reason);
                await refreshDetail(); setAudit(await benchmarkApi.history(benchmarkId)); setAuditPage(0); setReason(""); setNotice(`Benchmark revision ${published.number} published.`); })}>Publish benchmark revision</Button>
            <Typography variant="caption">Complete or exclude every case, including held-out cases; resolve disputes and approve criteria before publishing.</Typography>
          </>}
          {audit?.publications.map(item => <Box key={item.number}>
            <Typography fontWeight={700}>Published revision {item.number}</Typography><Typography variant="caption">{item.created_by_name} · {runDate(item.created_at).toLocaleString()}</Typography>
            <Typography>{item.reason}</Typography><Button disabled={busy} onClick={() => void exportFile(item.number)}>Download revision {item.number}</Button>
          </Box>)}
          {audit?.criteria.map(item => <Box key={item.revision}><Typography fontWeight={700}>Criteria change · {item.criteria.status}</Typography>
            <Typography variant="caption">{item.created_by_name} · {runDate(item.created_at).toLocaleString()}</Typography><Typography>{item.criteria.rationale}</Typography></Box>)}
          {audit && <Stack direction="row" spacing={1}><Button disabled={busy || auditPage === 0} onClick={() => void loadAudit(auditPage - 1)}>Newer history</Button>
            <Button disabled={busy || (audit.criteria.length < 20 && audit.publications.length < 20)} onClick={() => void loadAudit(auditPage + 1)}>Older history</Button></Stack>}
        </Stack></AccordionDetails>
      </Accordion>
    </>}
    <Accordion><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Import and export</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        {data && <Button disabled={busy || loading} onClick={() => void exportFile()} sx={{ alignSelf: "flex-start" }}>Download saved working copy</Button>}
        <Typography variant="body2">Exports contain the benchmark, reviews, and criteria for the offline evaluation framework. Unsaved form changes are not included.</Typography>
        {superAdmin && <>
          <FormControlLabel label="I have checked that imported benchmark content has the required reuse permissions." control={<Checkbox checked={importPermission} onChange={(_, value) => setImportPermission(value)} disabled={busy} />} />
          <Button component="label" variant="outlined" disabled={busy || !importPermission} sx={{ alignSelf: "flex-start" }}>Import new benchmark
            <input hidden type="file" accept="application/json,.json" disabled={busy || !importPermission} onChange={event => { importFile(event.target.files?.[0], "benchmark"); event.target.value = ""; }} />
          </Button>
          {data && <Button component="label" variant="outlined" disabled={blocked} sx={{ alignSelf: "flex-start" }}>Import review proposals
            <input hidden type="file" accept="application/json,.json" disabled={blocked} onChange={event => { importFile(event.target.files?.[0], "reviews"); event.target.value = ""; }} />
          </Button>}
          <Typography variant="caption">Imported labels become unapproved drafts with your import identity. Existing reviews are never overwritten.</Typography>
        </>}
      </Stack></AccordionDetails>
    </Accordion>
  </Stack>;
}
