import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Box, Button, Chip, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { AdminDigest, Digest } from "../types/digest";

interface DigestListProps {
  digests: Digest[];
  detailPath: (digest: Digest) => string;
  historyPath?: (digest: Digest) => string;
  ownerPath?: (digest: Digest) => string;
  showOwner?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}
function isAdminDigest(digest: Digest): digest is AdminDigest { return "owner" in digest; }
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}
function LatestSuccessfulRun({ digest, admin, historyPath }: { digest: Digest; admin: boolean; historyPath?: (digest: Digest) => string }) {
  const value = digest.latest_successful_run_at;
  if (!value) return <>Never</>;
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  return admin ? <Link component={RouterLink} to={historyPath?.(digest) ?? `/admin/digests/${digest.id}/runs`}>{formatted}</Link> : <>{formatted}</>;
}
function frequencyLabel(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
export function DigestList({ digests, detailPath, historyPath, ownerPath, showOwner = false,
  emptyTitle = "No digests yet", emptyDescription = "Create your first digest to begin monitoring research.",
}: DigestListProps) {
  if (digests.length === 0) return <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}>
    <Typography variant="h6">{emptyTitle}</Typography><Typography color="text.secondary">{emptyDescription}</Typography>
  </Paper>;
  const owner = (digest: Digest) => isAdminDigest(digest) ? <>
    <Typography>{ownerPath ? <Link component={RouterLink} to={ownerPath(digest)}>{digest.owner.full_name}</Link> : digest.owner.full_name}</Typography>
    <Typography variant="body2" color="text.secondary">{digest.owner.email}</Typography>
  </> : "—";
  const actions = (digest: Digest) => <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
    <Button component={RouterLink} to={detailPath(digest)} aria-label={`View digest ${digest.topic}`} endIcon={<ChevronRightRoundedIcon />}>
      View digest
    </Button>
    {historyPath && <Button component={RouterLink} to={historyPath(digest)} aria-label={`View runs for ${digest.topic}`}>View runs</Button>}
  </Stack>;
  return <>
    <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: "none", md: "block" }, borderRadius: 3 }}>
      <Table aria-label={showOwner ? "Managed research digests" : "Your research digests"}
        sx={showOwner ? { "& th, & td": { overflowWrap: "anywhere" } } : undefined}>
        <TableHead><TableRow>
          <TableCell scope="col">Topic</TableCell>{showOwner && <TableCell scope="col">Owner</TableCell>}
          <TableCell scope="col">Reporting period</TableCell><TableCell scope="col">Schedule</TableCell>
          <TableCell scope="col">Latest successful run</TableCell><TableCell scope="col" align="right">Actions</TableCell>
        </TableRow></TableHead>
        <TableBody>{digests.map(digest => <TableRow key={digest.id} hover>
          <TableCell component="th" scope="row"><Typography fontWeight={700}>{digest.topic}</Typography>
            <Typography variant="body2" color="text.secondary">Up to {digest.maximum_papers} papers</Typography></TableCell>
          {showOwner && <TableCell>{owner(digest)}</TableCell>}
          <TableCell>{formatDate(digest.reporting_from)} – {formatDate(digest.reporting_to)}</TableCell>
          <TableCell><Chip size="small" label={digest.schedule ? frequencyLabel(digest.schedule.frequency) : "Not scheduled"} /></TableCell>
          <TableCell><LatestSuccessfulRun digest={digest} admin={showOwner} historyPath={historyPath} /></TableCell>
          <TableCell align="right">{showOwner ? actions(digest) : <Button component={RouterLink} to={detailPath(digest)} endIcon={<ChevronRightRoundedIcon />}>View</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
    <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
      {digests.map(digest =>
      <Paper key={digest.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3, ...(showOwner ? { overflowWrap: "anywhere" } : {}) }}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={750} sx={{ mb: 0.5 }}>{digest.topic}</Typography>
            {showOwner && <Box sx={{ mb: 1 }}>{owner(digest)}</Box>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
              {formatDate(digest.reporting_from)} – {formatDate(digest.reporting_to)}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1.25 }}>Latest successful run: <LatestSuccessfulRun digest={digest} admin={showOwner} historyPath={historyPath} /></Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Chip size="small" label={digest.schedule ? frequencyLabel(digest.schedule.frequency) : "Not scheduled"} />
              <Typography variant="body2" color="text.secondary">Up to {digest.maximum_papers} papers</Typography>
            </Stack>
          </Box>
          {!showOwner && <Button component={RouterLink} to={detailPath(digest)} aria-label={`View ${digest.topic}`} sx={{ minWidth: 40, alignSelf: "center" }}><ChevronRightRoundedIcon /></Button>}
        </Stack>
        {showOwner && <Box sx={{ mt: 1.5 }}>{actions(digest)}</Box>}
      </Paper>)}</Stack>
  </>;
}
