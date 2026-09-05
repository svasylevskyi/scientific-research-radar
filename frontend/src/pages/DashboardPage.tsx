import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";

import { ApiError } from "../api/client";
import { digestsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";
import type { Digest } from "../types/digest";

const PAGE_SIZE = 10;

export function DashboardPage() {
  const { user } = useAuth();
  const [digests, setDigests] = useState<Digest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    digestsApi
      .list({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setDigests(result.items);
        setTotal(result.total);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load your digests.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 7 } }}>
        <Typography component="h1" variant="h2" sx={{ mb: 3 }}>
          Welcome, {user?.full_name.split(" ")[0]}.
        </Typography>
        <Button
          component={RouterLink}
          to="/digests/new"
          variant="contained"
          size="large"
          startIcon={<TravelExploreRoundedIcon />}
          sx={{ minHeight: 48 }}
        >
          Create research digest
        </Button>

        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 6, mb: 2.5 }}>
          <LibraryBooksRoundedIcon color="primary" />
          <Typography component="h2" variant="h4">Your digests</Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {isLoading ? (
          <Box
            role="status"
            aria-label="Loading digests"
            sx={{ py: 9, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : (
          <>
            <DigestList
              digests={digests}
              detailPath={(digest) => `/digests/${digest.id}`}
            />
            {total > PAGE_SIZE && (
              <Pagination
                count={pageCount}
                page={page}
                onChange={(_event, nextPage) => setPage(nextPage)}
                color="primary"
                sx={{ mt: 3, display: "flex", justifyContent: "center" }}
              />
            )}
            {total > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
                {total} {total === 1 ? "digest" : "digests"}
              </Typography>
            )}
          </>
        )}
      </Container>
    </Box>
  );
}
