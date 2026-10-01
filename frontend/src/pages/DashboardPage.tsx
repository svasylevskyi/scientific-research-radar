import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import { useSubscriptionAccess } from "../hooks/useSubscriptionAccess";
import { AllowanceNotice } from "../components/AllowanceNotice";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { pageNumber, queryPath, updateQuery, withReturnTo } from "../navigationContext";

import { digestsApi } from "../api/digests";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";

const PAGE_SIZE = 10;

export function DashboardPage() {
  const { user } = useAuth();
  const access = useSubscriptionAccess();
  const [search, setSearch] = useSearchParams();
  const page = pageNumber(search);
  const setPage = (value: number) => setSearch(current => updateQuery(current, { page: value === 1 ? null : value }), { preventScrollReset: true });
  const returnTo = queryPath("/radar", search);
  const load = useCallback((signal: AbortSignal) => digestsApi.list({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, signal }), [page]);
  const resource = usePollingResource(load, 0);
  useListPageBounds(page, resource.data?.total, PAGE_SIZE, setSearch);
  const digests = resource.data?.items ?? [];
  const total = resource.data?.total ?? 0;
  const isLoading = resource.loading;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 7 } }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 3 }}>
          <Box sx={{ flex: "1 1 28rem", minWidth: 0 }}>
            <Typography component="h1" variant="h2" sx={{ mb: 1, overflowWrap: "anywhere" }}>
              Welcome, {user?.full_name.split(" ")[0]}.
            </Typography>
            <Typography color="text.secondary" sx={{ width: "100%" }}>
              This is your personal research workspace. Create digests for the topics you follow,
              run or schedule research, and return here to explore your results.
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to={withReturnTo("/radar/digests/new", returnTo)}
            disabled={!access.data?.create_allowed || !!access.error}
            aria-describedby={!access.data?.create_allowed || access.error ? "create-allowance-notice" : undefined}
            variant="contained"
            size="large"
            startIcon={<TravelExploreRoundedIcon />}
            sx={{ minHeight: 48, maxWidth: "100%", flexShrink: 0, ml: "auto" }}
          >
            Create research digest
          </Button>
        </Box>

        <AllowanceNotice {...access} context="create" id="create-allowance-notice" />

        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 6, mb: 2.5 }}>
          <LibraryBooksRoundedIcon color="primary" />
          <Typography component="h2" variant="h4">Your digests</Typography>
        </Stack>

        <ResourceNotice {...resource} />
        {isLoading ? (
          <Box
            role="status"
            aria-label="Loading digests"
            sx={{ py: 9, display: "grid", placeItems: "center" }}
          >
            <CircularProgress size={34} />
          </Box>
        ) : resource.data ? (
          <>
            <DigestList
              digests={digests}
              detailPath={(digest) => withReturnTo(`/radar/digests/${digest.id}`, returnTo)}
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
