import type { AdminDigest } from "../types/digest";
import { useCallback } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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
export function DigestHistoryPage({ admin = false }: { admin?: boolean }) {
  const { digestId = "" } = useParams();
  const location = useLocation();
  const routeState = location.state as { success?: string } | null;
  const load = useCallback(async () => {
    const [digest, runs] = await Promise.all([
      admin ? adminDigestsApi.get(digestId) : digestsApi.get(digestId),
      loadRunHistory((offset) =>
        admin
          ? adminDigestsApi.listRuns(digestId, { offset, limit: 100 })
          : digestRunsApi.list(digestId, { offset, limit: 100 }),
      ),
    ]);
    return { digest, runs, owner: "owner" in digest ? (digest as AdminDigest).owner : null };
  }, [admin, digestId]);
  const resource = usePollingResource(load, 30000);
  const data = resource.data;
  return (
    <Box>
      <AppHeader />
      <Container component="main" id="main-content" tabIndex={-1} maxWidth="lg" sx={{ py: { xs: 3, sm: 6 } }}>
        {admin ? (
          <AdminDigestNavigation digestId={digestId} current="runs" />
        ) : (
          <Button component={Link} to={`/digests/${digestId}`}>
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
        {resource.error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button onClick={() => void resource.refresh()}>Retry</Button>
            }
          >
            {resource.error}
          </Alert>
        )}
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
              details={
                <Paper variant="outlined" sx={{ p: 3 }}>
                  <Typography variant="h6">Research scope</Typography>
                  <Typography>{data.digest.topic}</Typography>
                  <Button
                    component={Link}
                    to={`${admin ? "/admin" : ""}/digests/${digestId}`}
                  >
                    Open digest details and settings
                  </Button>
                </Paper>
              }
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
