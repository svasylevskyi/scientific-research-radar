import { Link, Stack, Typography } from "@mui/material";
import type { SourceAttributionData } from "../types/digest";

export function SourceAttribution({ value }: { value: SourceAttributionData }) {
  return <Stack spacing={0.5} sx={{ overflowWrap: "anywhere" }}>
    <Typography variant="body2">{value.title} — {value.authors.join(", ")}</Typography>
    <Stack direction="row" spacing={2}>
      <Link href={value.source_url} target="_blank" rel="noopener noreferrer">Original source</Link>
      <Link href={value.license_url} target="_blank" rel="noopener noreferrer">Reuse licence</Link>
    </Stack>
    <Typography variant="caption">{value.rights_notice}</Typography>
    <Typography variant="caption" color="text.secondary">{value.changes}</Typography>
  </Stack>;
}
