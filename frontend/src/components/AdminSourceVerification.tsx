import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Link, Pagination, Stack, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { researchQualityApi, type PaperVerification, type SourceVerification, type SourceHistory, type QualitySettings } from "../api/researchQuality";
import { runDate } from "../runHistory";
import type { DigestRunDetail } from "../types/digest";

const labels = { verified: "Verified metadata", conflict: "Conflicting metadata", unverified: "Unable to fully verify" };

export function SourcePaperEvidence({ paper }: { paper: PaperVerification }) {
  const actual = paper.evidence?.metadata;
  const rows = [
    ["Title", paper.claimed.title, actual?.title],
    ["Authors", paper.claimed.authors?.join(", "), actual?.authors?.join(", ")],
    ["Publication date(s)", paper.claimed.dates?.join(", "), actual?.dates?.join(", ")],
    ["Identifier", paper.evidence?.identifier ?? paper.claimed.identifier, actual?.identifier],
    ["DOI", paper.claimed.doi, actual?.doi],
  ];
  return <Accordion>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Stack spacing={1} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <Typography>{paper.title}</Typography>
        <Chip size="small" sx={{ alignSelf: "flex-start" }} label={labels[paper.status]} color={paper.status === "verified" ? "success" : paper.status === "conflict" ? "warning" : "default"} variant="outlined" />
      </Stack>
    </AccordionSummary>
    <AccordionDetails><Stack spacing={2} sx={{ overflowWrap: "anywhere" }}>
      <Typography variant="caption">Paper ID: {paper.external_id}</Typography>
      {paper.evidence && <Typography variant="body2">
        {paper.evidence.provider} · Retrieved {runDate(paper.evidence.retrieved_at).toLocaleString()} · {paper.evidence.cached ? "Cached response" : "New lookup"}
        {" · "}<Link href={paper.evidence.request_url} target="_blank" rel="noopener noreferrer">Metadata request</Link>
      </Typography>}
      {rows.map(([label, claimed, observed]) => <Box key={label}>
        <Typography fontWeight={700} variant="body2">{label}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
          <Typography variant="body2">Saved: {claimed || "Not recorded"}</Typography>
          <Typography variant="body2">Source: {observed || "Not available"}</Typography>
        </Box>
      </Box>)}
      {(paper.checks ?? []).map((check) => <Typography variant="body2" key={check.field}>
        <strong>{check.field} — {check.status}:</strong> {check.message}
      </Typography>)}
      {(paper.notes ?? []).map((note, index) => <Typography key={index} variant="body2" color="text.secondary">{note}</Typography>)}
      {actual && <>
        <Typography variant="body2">Source availability: metadata retrieved{actual.abstract ? "; reusable abstract retained" : "; no reusable abstract retained"}. Full text was not fetched by this metadata check.</Typography>
        {actual.url && <Link href={actual.url} target="_blank" rel="noopener noreferrer">Source record</Link>}
        {!!actual.full_text_links?.length && <Box>
          <Typography variant="body2">Provider-reported full-text links (access not tested):</Typography>
          {actual.full_text_links.map((url, index) => <Link key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer" display="block">Link {index + 1}</Link>)}
        </Box>}
        {actual.abstract && <Accordion><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Retrieved abstract (up to 10,000 characters)</Typography></AccordionSummary><AccordionDetails><Typography variant="body2">{actual.abstract}</Typography></AccordionDetails></Accordion>}
      </>}
    </Stack></AccordionDetails>
  </Accordion>;
}

function EvidenceBatch({ batch }: { batch: SourceVerification }) {
  return <Stack spacing={2}>
    <Typography variant="body2">{batch.trigger === "automatic" ? "Automatic check" : batch.created_by_name} · {runDate(batch.created_at).toLocaleString()} · Settings {batch.config.version} · Source checks {batch.engine_version} · Source mode {batch.config.config.source_verification_mode}</Typography>
    <Typography variant="body2">{batch.papers.filter(paper => paper.status === "verified").length} verified · {batch.papers.filter(paper => paper.status === "conflict").length} conflicting · {batch.papers.filter(paper => paper.status === "unverified").length} unverified</Typography>
    {batch.findings.filter(finding => !finding.paper_ids?.length).map(finding => <Alert key={finding.code} severity="warning">{finding.message}</Alert>)}
    {!batch.papers.length && !batch.findings.length && <Typography>No selected or cited papers to verify.</Typography>}
    {batch.papers.map(paper => <SourcePaperEvidence key={paper.external_id} paper={paper} />)}
  </Stack>;
}

export function AdminSourceVerification({ digestId, run, settings, history, page, setPage, stale, refresh }: {
  digestId: string; run: DigestRunDetail; settings: QualitySettings; history: SourceHistory;
  page: number; setPage: (page: number) => void; stale: boolean; refresh: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SourceVerification | null>(null);
  const disabled = run.status !== "completed" || stale || settings.config.source_verification_mode === "off";
  async function verify() {
    if (disabled || pending.current) return;
    pending.current = true;
    setSaving(true); setError(""); setSaved(null);
    try {
      setSaved(await researchQualityApi.verifySources(digestId, run.id, settings.version));
      setPage(1);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Source verification failed."); }
    finally { pending.current = false; setSaving(false); }
  }
  const batches = history.items;
  return <Stack spacing={2}>
    <Typography variant="body2" color="text.secondary">Checks paper identity and metadata using external Crossref/arXiv requests, without OpenAI charges. This does not check claim accuracy or retrieve full text. Cached metadata may be reused for 24 hours; temporary failures can be retried after a minute.</Typography>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Button variant="outlined" disabled={disabled || saving} onClick={() => void verify()}>{saving ? "Verifying sources…" : history.total ? "Recheck sources (external)" : "Verify sources (external)"}</Button>
    </Stack>
    {settings.config.source_verification_mode === "off" && <Typography variant="body2">Source verification is disabled in Research quality settings.</Typography>}
    {run.status !== "completed" && <Typography variant="body2">Manual verification requires a completed run.</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
    {saved && <Alert severity="success">Source verification saved.</Alert>}
    {saved && !batches.some(batch => batch.id === saved.id) && <EvidenceBatch batch={saved} />}
    {!batches.length && !saved && <Typography variant="body2">No source verification has been recorded for this run.</Typography>}
    {batches.map((batch, index) => <Accordion key={batch.id}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{page === 1 && index === 0 ? "Latest source verification" : "Earlier source verification"} · {runDate(batch.created_at).toLocaleString()}</Typography></AccordionSummary>
      <AccordionDetails><EvidenceBatch batch={batch} /></AccordionDetails>
    </Accordion>)}
    {history.total > 5 && <Pagination page={page} count={Math.ceil(history.total / 5)} onChange={(_, value) => setPage(value)} disabled={saving} aria-label="Source verification history pages" />}
  </Stack>;
}
