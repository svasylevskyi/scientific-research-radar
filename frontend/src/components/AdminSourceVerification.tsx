import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Link, Pagination, Stack, Typography } from "@mui/material";
import { useCallback, useRef, useState } from "react";
import { researchQualityApi, type PaperVerification, type SourceVerification } from "../api/researchQuality";
import { usePollingResource } from "../hooks/usePollingResource";
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
        <Typography variant="body2">Source availability: metadata retrieved{actual.abstract ? "; abstract included in metadata" : "; no abstract returned"}. Full text was not fetched.</Typography>
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

export function AdminSourceVerification({ digestId, run }: { digestId: string; run: DigestRunDetail }) {
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SourceVerification | null>(null);
  const load = useCallback(async () => {
    const [settings, history] = await Promise.all([researchQualityApi.get(), researchQualityApi.sources(digestId, run.id, page)]);
    return { settings, history };
  }, [digestId, run.id, page]);
  const resource = usePollingResource(load, 60000);
  const data = resource.data;
  const disabled = run.status !== "completed" || !data || !!resource.error || resource.loading || data.settings.config.source_verification_mode === "off";
  async function verify() {
    if (disabled || !data || pending.current) return;
    pending.current = true;
    setSaving(true); setError(""); setSaved(null);
    try {
      setSaved(await researchQualityApi.verifySources(digestId, run.id, data.settings.version));
      setPage(1);
      await resource.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Source verification failed."); }
    finally { pending.current = false; setSaving(false); }
  }
  const batches = data?.history.items ?? [];
  return <Stack spacing={2}>
    <Typography component="h3" variant="subtitle1" fontWeight={700}>Independent source verification</Typography>
    <Typography variant="body2" color="text.secondary">Compare saved paper details with Crossref DOI or arXiv metadata. Rechecking uses current settings and retains earlier evidence. It makes no OpenAI requests and never changes existing email decisions. Metadata is cached for up to 24 hours; temporary failures can be retried after a minute.</Typography>
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Button variant="outlined" disabled={disabled || saving} onClick={() => void verify()}>{saving ? "Verifying sources…" : data?.history.total ? "Recheck sources" : "Verify sources"}</Button>
      <Button disabled={saving || resource.loading} onClick={() => void resource.refresh()}>Refresh evidence</Button>
    </Stack>
    {data?.settings.config.source_verification_mode === "off" && <Typography variant="body2">Source verification is disabled in Research quality settings.</Typography>}
    {run.status !== "completed" && <Typography variant="body2">Manual verification requires a completed run.</Typography>}
    {resource.loading && <Typography role="status">Loading source evidence…</Typography>}
    {(error || resource.error) && <Alert severity="error">{error || resource.error}</Alert>}
    {saved && <Alert severity="success">Source verification saved.</Alert>}
    {saved && !batches.some(batch => batch.id === saved.id) && <EvidenceBatch batch={saved} />}
    {!resource.loading && !batches.length && !saved && <Typography variant="body2">No source verification has been recorded for this run.</Typography>}
    {batches.map((batch, index) => <Accordion key={batch.id} defaultExpanded={page === 1 && index === 0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{page === 1 && index === 0 ? "Latest source verification" : "Earlier source verification"} · {runDate(batch.created_at).toLocaleString()}</Typography></AccordionSummary>
      <AccordionDetails><EvidenceBatch batch={batch} /></AccordionDetails>
    </Accordion>)}
    {!!data && data.history.total > 5 && <Pagination page={page} count={Math.ceil(data.history.total / 5)} onChange={(_, value) => setPage(value)} disabled={saving} aria-label="Source verification history pages" />}
  </Stack>;
}
