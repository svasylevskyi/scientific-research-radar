import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import { Box, Button, CircularProgress, Container } from "@mui/material";
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { pageNumber, queryPath, updateQuery, withReturnTo } from "../navigationContext";
import { withSupportReturn } from "../admin/support";
import { adminDigestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";
import { DigestOwnerFilter } from "../components/DigestOwnerFilter";
import { AdminListFooter, AdminPageHeading, AdminSupportReturn } from "../components/AdminSupport";

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
  return <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
    <AppHeader />
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
      <AdminSupportReturn />
      <AdminPageHeading title="Digest management" icon={<LibraryBooksRoundedIcon color="primary" />}
        description="Review and manage research digests across user accounts."
        actions={<>
          <DigestOwnerFilter key={`${ownerId}:${ownerQuery}`} ownerId={ownerId} query={ownerQuery} onChange={changeOwner} />
          {(ownerId || ownerQuery) && <Button onClick={() => changeOwner({})} sx={{ minHeight: 40 }}>Clear filter</Button>}
          <Button disabled={isLoading || resource.retrying || resource.retryAt > Date.now()} onClick={() => void resource.refresh()} sx={{ minHeight: 40 }}>Refresh</Button>
        </>} />
      <ResourceNotice {...resource} />
      {isLoading ? <Box role="status" aria-label="Loading digests" sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress size={34} /></Box>
        : resource.data ? <>
          <DigestList digests={digests}
            detailPath={digest => withReturnTo(`/admin/digests/${digest.id}`, returnTo)}
            historyPath={digest => withReturnTo(`/admin/digests/${digest.id}/runs`, returnTo)}
            ownerPath={digest => withSupportReturn(`/admin/users/${encodeURIComponent(digest.owner_id)}`, returnTo)}
            showOwner emptyTitle={ownerId || ownerQuery ? "No matching digests" : "No digests yet"}
            emptyDescription={ownerQuery ? "No digests belong to owners matching this name or email."
              : ownerId ? "This user has not created any digests." : "No accessible users have created a digest yet."} />
          <AdminListFooter page={page} pageSize={PAGE_SIZE} total={total} count={digests.length} noun="digests" onChange={setPage} />
        </> : null}
    </Container>
  </Box>;
}
