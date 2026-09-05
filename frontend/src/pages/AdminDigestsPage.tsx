import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import { adminDigestsApi } from "../api/digests";
import { AppHeader } from "../components/AppHeader";
import { DigestList } from "../components/DigestList";
import type { User } from "../types/auth";
import type { AdminDigest } from "../types/digest";

const PAGE_SIZE = 20;

export function AdminDigestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerId = searchParams.get("owner_id") ?? "";
  const [digests, setDigests] = useState<AdminDigest[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .listUsers({ offset: 0, limit: 100 })
      .then(async (result) => {
        let availableOwners = result.items;
        if (ownerId && !availableOwners.some((owner) => owner.id === ownerId)) {
          try {
            const selectedOwner = await adminApi.getUser(ownerId);
            availableOwners = [selectedOwner, ...availableOwners];
          } catch {
            // The digest request will return an empty list for an inaccessible owner.
          }
        }
        if (active) setOwners(availableOwners);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load digest owners.");
        }
      });
    return () => {
      active = false;
    };
  }, [ownerId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    adminDigestsApi
      .list({
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        ownerId: ownerId || undefined,
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
    };
  }, [ownerId, page]);

  function changeOwner(nextOwnerId: string) {
    setPage(1);
    setSearchParams(nextOwnerId ? { owner_id: nextOwnerId } : {});
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ sm: "flex-end" }}
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
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 280 } }}>
            <InputLabel id="digest-owner-filter-label">Digest owner</InputLabel>
            <Select
              labelId="digest-owner-filter-label"
              value={ownerId}
              label="Digest owner"
              onChange={(event) => changeOwner(event.target.value)}
              startAdornment={<FilterAltRoundedIcon fontSize="small" sx={{ mr: 1 }} />}
            >
              <MenuItem value="">All accessible users</MenuItem>
              {owners.map((owner) => (
                <MenuItem key={owner.id} value={owner.id}>
                  {owner.full_name} · {owner.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
                ownerId
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
