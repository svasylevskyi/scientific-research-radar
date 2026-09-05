import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Alert, Box, Button, Container, Typography } from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";

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
  const [initialValues] = useState(createDefaultDigestFormValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDigest(input: DigestInput) {
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await digestsApi.create(input);
      navigate(`/digests/${created.id}`, {
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
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button
          component={RouterLink}
          to="/"
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
          Define what to monitor, who the digest is for, and how often it should run.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <DigestForm
          initialValues={initialValues}
          submitLabel="Create digest"
          isSubmitting={isSubmitting}
          onSubmit={createDigest}
          onCancel={() => navigate("/")}
        />
      </Container>
    </Box>
  );
}
