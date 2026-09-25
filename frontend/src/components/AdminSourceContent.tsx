import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Link, Stack, Typography } from "@mui/material";
import type { PaperContent, RunContent } from "../api/researchQuality";
import { runDate } from "../runHistory";

export function ContentEvidence({ item }: { item: PaperContent }) {
  const document = item.document;
  return <Accordion>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Stack spacing={1} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <Typography>{document.title}</Typography>
        <Chip size="small" variant="outlined" sx={{ alignSelf: "flex-start" }} label={(document.basis ?? "metadata_only").replaceAll("_", " ")} />
      </Stack>
    </AccordionSummary>
    <AccordionDetails><Stack spacing={2} sx={{ overflowWrap: "anywhere" }}>
      <Typography variant="body2">{document.authors?.join(", ")} · Retrieved {runDate(document.retrieved_at).toLocaleString()} · {document.cached ? "Cached content" : "Run capture"}</Typography>
      <Typography variant="body2">Version: {document.source_version || "Not available"} · Content policy: {document.policy_version}</Typography>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
        {document.source_url && <Link href={document.source_url} target="_blank" rel="noopener noreferrer">Original source</Link>}
        {document.license_url && <Link href={document.license_url} target="_blank" rel="noopener noreferrer">Reuse licence</Link>}
        {document.permission_source && <Link href={document.permission_source} target="_blank" rel="noopener noreferrer">Permission evidence</Link>}
      </Stack>
      {document.rights_notice && <Typography variant="body2">{document.rights_notice}</Typography>}
      {(document.notes ?? []).map((note, index) => <Typography key={index} variant="body2" color="text.secondary">{note}</Typography>)}
      {item.warnings.map((warning, index) => <Alert key={index} severity="warning">{warning}</Alert>)}
      {item.statements.map((statement, index) => <Box key={index} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, borderTop: 1, borderColor: "divider", pt: 2 }}>
        <Box><Typography fontWeight={700}>{index === 0 ? "Summary" : `Finding ${index}`}</Typography><Typography>{statement.text}</Typography></Box>
        <Stack spacing={1}><Typography fontWeight={700}>Referenced evidence</Typography>
          {!statement.references_valid && <Typography color="text.secondary">No complete, valid evidence reference. Human review required.</Typography>}
          {statement.passage_ids.map((id) => {
            const passage = document.passages?.find(p => p.id === id);
            return passage ? <Box key={id}><Typography variant="caption">{passage.section} · {id}</Typography><Typography component="blockquote" sx={{ m: 0, pl: 2, borderLeft: 2, borderColor: "divider" }}>{passage.text}</Typography></Box> : <Typography key={id}>Unknown passage: {id}</Typography>;
          })}
        </Stack>
      </Box>)}
      {!!document.passages?.length && <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>All saved excerpts ({document.passages.length})</Typography></AccordionSummary>
        <AccordionDetails><Stack spacing={2}>{document.passages.map(passage => <Box key={passage.id}><Typography variant="subtitle2">{passage.section} · {passage.id}</Typography><Typography>{passage.text}</Typography></Box>)}</Stack></AccordionDetails>
      </Accordion>}
      {document.content_sha256 && <Typography variant="caption">Content SHA-256: {document.content_sha256}</Typography>}
    </Stack></AccordionDetails>
  </Accordion>;
}

export function AdminSourceContent({ content }: { content: RunContent }) {
  return <Stack spacing={2}>
    <Typography variant="body2" color="text.secondary">Inspect the permission-checked excerpts supplied during generation. A valid passage reference does not establish claim support. Viewing or refreshing these saved inputs never fetches source content.</Typography>
    {content.legacy && <Typography>This older run predates saved summary evidence. Its sources cannot be reconstructed as evidence used during generation.</Typography>}
    {!content.legacy && !content.items.length && <Typography>No source content has been captured for this run yet.</Typography>}
    {content.items.map(item => <ContentEvidence key={item.document.external_id} item={item} />)}
  </Stack>;
}
