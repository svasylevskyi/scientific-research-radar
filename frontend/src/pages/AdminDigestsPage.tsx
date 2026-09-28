import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import {
  Box,
  CircularProgress,
  Container,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { pageNumber, queryPath, updateQuery, withReturnTo } from "../navigationContext";

import { adminDigestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";
import { DigestOwnerFilter } from "../components/DigestOwnerFilter";

const PAGE_SIZE = 20;

export function AdminDigestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerId = searchParams.get("owner_id") ?? "";
  const ownerQuery = searchParams.get("owner_query") ?? "";
  const page = pageNumber(searchParams);
  const setPage = (value: number) => setSearchParams(current => updateQuery(current, { page: value === 1 ? null : value }), { preventScrollReset: true });
  const returnTo = queryPath("/admin/digests", searchParams);
  const load = useCallback((signal: AbortSignal) => adminDigestsApi.list({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, ownerId: ownerId || undefined, ownerQuery: ownerQuery || undefined, signal }), [page, ownerId, ownerQuery]);
  const resource = usePollingResource(load, 0);
  useListPageBounds(page, resource.data?.total, PAGE_SIZE, setSearchParams);
  const digests = resource.data?.items ?? [];
  const total = resource.data?.total ?? 0;
  const isLoading = resource.loading;

  function changeOwner(filter: { ownerId?: string; query?: string }) {
    setSearchParams(current => updateQuery(current, { page: null, owner_id: filter.ownerId || null, owner_query: filter.query || null }), { preventScrollReset: true });
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

        <ResourceNotice {...resource} />
        {isLoading ? (
          <Box
            role="status"
            aria-label="Loading digests"
            sx={{ py: 10, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : resource.data ? (
          <>
            <DigestList
              digests={digests}
              detailPath={(digest) => withReturnTo(`/admin/digests/${digest.id}`, returnTo)}
              historyPath={(digest) => withReturnTo(`/admin/digests/${digest.id}/runs`, returnTo)}
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
        ) : null}
      </Container>
    </Box>
  );
}
