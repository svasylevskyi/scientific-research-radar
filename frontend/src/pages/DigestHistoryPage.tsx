import { ResourceNotice } from "../components/ResourceNotice";
import type { AdminDigest } from "../types/digest";
import { useCallback } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Typography,
} from "@mui/material";
import { adminDigestsApi, digestRunsApi, digestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { AdminDigestNavigation } from "../components/AdminDigestNavigation";
import { DigestWorkspace } from "../components/DigestWorkspace";
import { usePollingResource } from "../hooks/usePollingResource";
import { loadRunHistory } from "../runHistory";
import { listReturnTo } from "../navigationContext";
export function DigestHistoryPage({ admin = false }: { admin?: boolean }) {
  const { digestId = "" } = useParams();
  const location = useLocation();
  const routeState = location.state as { success?: string } | null;
  const load = useCallback(async (signal: AbortSignal) => {
    const [digest, runs] = await Promise.all([
      admin ? adminDigestsApi.get(digestId, signal) : digestsApi.get(digestId, signal),
      loadRunHistory((offset) =>
        admin
          ? adminDigestsApi.listRuns(digestId, { offset, limit: 100, signal })
          : digestRunsApi.list(digestId, { offset, limit: 100, signal }),
      ),
    ]);
    return { digest, runs, owner: "owner" in digest ? (digest as AdminDigest).owner : null };
  }, [admin, digestId]);
  const resource = usePollingResource(load, 30000);
  const data = resource.data;
  return (
    <Box>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
        {admin ? (
          <>
            <Button
              component={Link}
              to={listReturnTo(new URLSearchParams(location.search), "/admin/digests")}
              color="inherit"
              startIcon={<ArrowBackRoundedIcon />}
              sx={{ mb: 2 }}
            >
              Back to digest management
            </Button>
            <AdminDigestNavigation digestId={digestId} current="runs" />
          </>
        ) : (
          <Button component={Link} to={`/radar/digests/${digestId}${location.search}`}>
            Back to digest
          </Button>
        )}
        <Typography component="h1" variant="h3" gutterBottom>
          {data?.digest.topic ?? "Digest research output"}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Review research output by run. Execution details and usage estimates
          are available in run diagnostics.
        </Typography>
        {data?.owner && (
          <Typography sx={{ mb: 2, overflowWrap: "anywhere" }}>
            Owner:{" "}
            <Button
              component={Link}
              to={`/admin/users/${data.owner.id}`}
              sx={{ textTransform: "none" }}
            >
              {data.owner.full_name} · {data.owner.email}
            </Button>
          </Typography>
        )}
        {routeState?.success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {routeState.success}
          </Alert>
        )}
        <ResourceNotice {...resource} />
        {resource.loading && (
          <Typography role="status">Loading digest history…</Typography>
        )}
        {data &&
          (data.runs.length ? (
            <DigestWorkspace
              key={digestId}
              admin={admin}
              digestId={digestId}
              runs={data.runs}
              latestRun={null}
              runBlocked={admin}
              onRetry={async (run) => {
                await digestRunsApi.retry(digestId, run.id);
                await resource.refresh();
              }}
              onUpdate={() => void resource.refresh()}
            />
          ) : (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography>This digest has not been run yet.</Typography>
            </Paper>
          ))}
      </Container>
    </Box>
  );
}
