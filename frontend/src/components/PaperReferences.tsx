import { Box, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { DigestRunDetail } from "../types/digest";
import { resolvePaperReference, safeSourceUrl, type PaperHref } from "../resultPresentation";

export function PaperReferences({ ids, run, paperHref }: {
  ids: string[]; run: DigestRunDetail; paperHref?: PaperHref;
}) {
  if (ids.length === 0) return <Typography variant="body2" color="text.secondary">No supporting papers were referenced.</Typography>;
  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none", minWidth: 0 }}>
      {ids.map((id, index) => {
        const result = resolvePaperReference(run.paper_results, id);
        const source = safeSourceUrl(result?.paper.url);
        const pdf = safeSourceUrl(result?.search_data.pdf_url);
        return (
          <Box component="li" key={`${id}-${index}`} sx={{ overflowWrap: "anywhere", minWidth: 0 }}>
            {result && paperHref ? (
              <Link component={RouterLink} to={paperHref(result.paper.id)} preventScrollReset
                underline="always" aria-label={`Open paper summary: ${result.paper.title}`} sx={{ fontWeight: 650 }}>
                {result.paper.title}
              </Link>
            ) : <Typography variant="body2" fontWeight={650}>{result?.paper.title ?? "Unresolved paper reference"}</Typography>}
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="baseline">
              <Typography variant="caption" color="text.secondary">{id}</Typography>
              {!result && <Typography variant="caption" color="text.secondary">No unique match in this run.</Typography>}
              {source && <Link href={source} target="_blank" rel="noopener noreferrer" variant="caption"
                aria-label={`Original source for ${result?.paper.title} (opens in a new tab)`}>Original source ↗</Link>}
              {pdf && <Link href={pdf} target="_blank" rel="noopener noreferrer" variant="caption"
                aria-label={`PDF for ${result?.paper.title} (opens in a new tab)`}>PDF ↗</Link>}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
