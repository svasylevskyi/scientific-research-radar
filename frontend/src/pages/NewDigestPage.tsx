import { useSubscriptionAccess } from "../hooks/useSubscriptionAccess";
import { AllowanceNotice } from "../components/AllowanceNotice";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, Container, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { listReturnTo, withReturnTo } from "../navigationContext";

import { ApiError } from "../api/client";
import { digestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import {
  createDefaultDigestFormValues,
  DigestForm,
} from "../components/DigestForm";
import type { DigestInput } from "../types/digest";

export function NewDigestPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = listReturnTo(search, "/radar");
  const access = useSubscriptionAccess();
  const [initialValues, setInitialValues] = useState<ReturnType<typeof createDefaultDigestFormValues> | null>(null);
  useEffect(() => {
    if (access.data?.create_allowed && !initialValues) {
      setInitialValues({ ...createDefaultDigestFormValues(), maximumPapers: String(Math.min(20, access.data.paper_limit)) });
    }
  }, [access.data, initialValues]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDigest(input: DigestInput) {
    if (!access.data?.create_allowed || access.error) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await digestsApi.create(input);
      navigate(withReturnTo(`/radar/digests/${created.id}`, returnTo), {
        replace: true,
        state: { success: "Digest created." },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the digest.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Box data-page-column="centered" sx={{ width: "100%", maxWidth: 960, minWidth: 0, mx: "auto" }}>
          <Button
            component={RouterLink}
            to={returnTo}
            color="inherit"
            startIcon={<ArrowBackRoundedIcon />}
            sx={{ mb: 2 }}
          >
            Back to workspace
          </Button>

          <Typography component="h1" variant="h3" sx={{ mb: 1 }}>
            Create research digest
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Define what to monitor, who the digest is for, and which reporting window to research.
          </Typography>

          <AllowanceNotice {...access} context="create" />
          {initialValues && <DigestForm
            initialValues={initialValues}
            paperLimit={access.data?.paper_limit || Number(initialValues.maximumPapers)}
            submitDisabled={!access.data?.create_allowed || !!access.error}
            submitNotice={error ? { severity: "error", message: error } : null}
            onEdit={() => setError(null)}
            submitLabel="Create digest"
            isSubmitting={isSubmitting}
            onSubmit={createDigest}
            onCancel={() => navigate(returnTo)}
          />}
        </Box>
      </Container>
    </Box>
  );
}
