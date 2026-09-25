import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { adminDigestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";
import { DigestOwnerFilter } from "../components/DigestOwnerFilter";
import type { AdminDigest } from "../types/digest";

const PAGE_SIZE = 20;

export function AdminDigestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerId = searchParams.get("owner_id") ?? "";
  const ownerQuery = searchParams.get("owner_query") ?? "";
  const [digests, setDigests] = useState<AdminDigest[]>([]);
  const [total, setTotal] = useState(0);
  const filterKey = `${ownerId}:${ownerQuery}`;
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (page: number) => setPagination({ key: filterKey, page });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    adminDigestsApi
      .list({
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        ownerId: ownerId || undefined,
        ownerQuery: ownerQuery || undefined,
        signal: controller.signal,
      })
      .then((result) => {
        if (!active) return;
        setDigests(result.items);
        setTotal(result.total);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load digests.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [ownerId, ownerQuery, page]);

  function changeOwner(filter: { ownerId?: string; query?: string }) {
    setPage(1);
    setSearchParams(filter.ownerId ? { owner_id: filter.ownerId } : filter.query ? { owner_query: filter.query } : {});
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ md: "flex-end" }}
          sx={{ mb: 4 }}
        >
          <Box>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.75 }}>
              <LibraryBooksRoundedIcon color="primary" />
              <Typography component="h1" variant="h3">Digest management</Typography>
            </Stack>
            <Typography color="text.secondary">
              Review and manage research digests across user accounts.
            </Typography>
          </Box>
          <DigestOwnerFilter key={`${ownerId}:${ownerQuery}`} ownerId={ownerId} query={ownerQuery} onChange={changeOwner} />
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        {isLoading ? (
          <Box
            role="status"
            aria-label="Loading digests"
            sx={{ py: 10, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : (
          <>
            <DigestList
              digests={digests}
              detailPath={(digest) => `/admin/digests/${digest.id}`}
              showOwner
              emptyTitle="No digests found"
              emptyDescription={
                ownerQuery ? "No digests belong to owners matching this name or email."
                : ownerId
                  ? "This user has not created any digests."
                  : "No accessible users have created a digest yet."
              }
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
