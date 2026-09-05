import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { adminDigestsApi, digestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestForm, digestToFormValues } from "../components/DigestForm";
import type { AdminDigest, Digest, DigestInput } from "../types/digest";

interface DigestDetailPageProps {
  admin?: boolean;
}

function isAdminDigest(digest: Digest): digest is AdminDigest {
  return "owner" in digest;
}

export function DigestDetailPage({ admin = false }: DigestDetailPageProps) {
  const { digestId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { success?: string } | null;
  const backPath = admin ? "/admin/digests" : "/";
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(routeState?.success ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    const request = admin ? adminDigestsApi.get(digestId) : digestsApi.get(digestId);
    request
      .then((result) => {
        if (active) setDigest(result);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load this digest.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admin, digestId]);

  async function updateDigest(input: DigestInput) {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = admin
        ? await adminDigestsApi.update(digestId, input)
        : await digestsApi.update(digestId, input);
      setDigest(updated);
      setSuccess("Digest details updated.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update this digest.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDigest() {
    setIsSaving(true);
    setError(null);
    try {
      if (admin) {
        await adminDigestsApi.delete(digestId);
      } else {
        await digestsApi.delete(digestId);
      }
      navigate(backPath, { replace: true });
    } catch (caught) {
      setConfirmDelete(false);
      setError(caught instanceof ApiError ? caught.message : "Could not delete this digest.");
      setIsSaving(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button
          component={RouterLink}
          to={backPath}
          color="inherit"
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ mb: 2 }}
        >
          {admin ? "Back to digest management" : "Back to workspace"}
        </Button>

        {isLoading ? (
          <Box
            role="status"
            aria-label="Loading digest"
            sx={{ py: 10, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : !digest ? (
          <Alert severity="error">{error ?? "Digest not found."}</Alert>
        ) : (
          <>
            <Typography component="h1" variant="h3" sx={{ mb: 1 }}>
              {digest.topic}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Review and update the research scope and reporting settings.
            </Typography>

            {admin && isAdminDigest(digest) && (
              <Paper variant="outlined" sx={{ p: 2.25, mb: 2.5, borderRadius: 3 }}>
                <Typography variant="caption" color="text.secondary">Digest owner</Typography>
                <Typography fontWeight={700}>{digest.owner.full_name}</Typography>
                <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                  {digest.owner.email}
                </Typography>
              </Paper>
            )}
            {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2.5 }}>{success}</Alert>}

            <DigestForm
              key={digest.updated_at}
              initialValues={digestToFormValues(digest)}
              submitLabel="Save changes"
              isSubmitting={isSaving}
              onSubmit={updateDigest}
            />

            <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, mt: 3, borderRadius: 3 }}>
              <Typography variant="h6" color="error.main" sx={{ mb: 0.75 }}>
                Delete digest
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Permanently removes this digest and its saved configuration.
              </Typography>
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineRoundedIcon />}
                disabled={isSaving}
                onClick={() => setConfirmDelete(true)}
              >
                Delete digest
              </Button>
            </Paper>
          </>
        )}
      </Container>

      <Dialog
        open={confirmDelete}
        onClose={() => {
          if (!isSaving) setConfirmDelete(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Delete this digest?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {digest
              ? `“${digest.topic}” will be permanently deleted. This action cannot be undone.`
              : "This digest will be permanently deleted."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={isSaving}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteDigest} disabled={isSaving}>
            Delete permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
