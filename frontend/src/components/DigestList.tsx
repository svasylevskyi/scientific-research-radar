import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import type { AdminDigest, Digest } from "../types/digest";

interface DigestListProps {
  digests: Digest[];
  detailPath: (digest: Digest) => string;
  showOwner?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

function isAdminDigest(digest: Digest): digest is AdminDigest {
  return "owner" in digest;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function frequencyLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function DigestList({
  digests,
  detailPath,
  showOwner = false,
  emptyTitle = "No digests yet",
  emptyDescription = "Create your first digest to begin monitoring research.",
}: DigestListProps) {
  if (digests.length === 0) {
    return (
      <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}>
        <Typography variant="h6">{emptyTitle}</Typography>
        <Typography color="text.secondary">{emptyDescription}</Typography>
      </Paper>
    );
  }

  return (
    <>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ display: { xs: "none", md: "block" }, borderRadius: 3 }}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Topic</TableCell>
              {showOwner && <TableCell>Owner</TableCell>}
              <TableCell>Reporting period</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {digests.map((digest) => (
              <TableRow key={digest.id} hover>
                <TableCell>
                  <Typography fontWeight={700}>{digest.topic}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Up to {digest.maximum_papers} papers
                  </Typography>
                </TableCell>
                {showOwner && (
                  <TableCell>
                    {isAdminDigest(digest) ? (
                      <>
                        <Typography>{digest.owner.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {digest.owner.email}
                        </Typography>
                      </>
                    ) : "—"}
                  </TableCell>
                )}
                <TableCell>
                  {formatDate(digest.reporting_from)} – {formatDate(digest.reporting_to)}
                </TableCell>
                <TableCell><Chip size="small" label={frequencyLabel(digest.frequency)} /></TableCell>
                <TableCell align="right">
                  <Button
                    component={RouterLink}
                    to={detailPath(digest)}
                    endIcon={<ChevronRightRoundedIcon />}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
        {digests.map((digest) => (
          <Paper key={digest.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={750} sx={{ mb: 0.5 }}>{digest.topic}</Typography>
                {showOwner && isAdminDigest(digest) && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {digest.owner.full_name} · {digest.owner.email}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                  {formatDate(digest.reporting_from)} – {formatDate(digest.reporting_to)}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={frequencyLabel(digest.frequency)} />
                  <Typography variant="body2" color="text.secondary">
                    Up to {digest.maximum_papers} papers
                  </Typography>
                </Stack>
              </Box>
              <Button
                component={RouterLink}
                to={detailPath(digest)}
                aria-label={`View ${digest.topic}`}
                sx={{ minWidth: 40, alignSelf: "center" }}
              >
                <ChevronRightRoundedIcon />
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </>
  );
}
