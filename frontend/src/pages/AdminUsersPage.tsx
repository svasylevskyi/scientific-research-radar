import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  InputAdornment,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { pageNumber, queryPath, updateQuery, withReturnTo } from "../navigationContext";

import { closureLabels } from "../api/accountClosure";
import { adminApi } from "../api/admin";
import { AppHeader } from "../components/AppHeader";
import { UserRoleChip } from "../components/UserRoleChip";

const PAGE_SIZE = 20;

export function AdminUsersPage() {
  const [search, setSearch] = useSearchParams();
  const page = pageNumber(search);
  const query = search.get("query") ?? "";
  const [searchText, setSearchText] = useState(query);
  useEffect(() => setSearchText(query), [query]);
  const setPage = (value: number) => setSearch(current => updateQuery(current, { page: value === 1 ? null : value }), { preventScrollReset: true });
  const returnTo = queryPath("/admin/users", search);
  const load = useCallback((signal: AbortSignal) => adminApi.listUsers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, query, signal }), [page, query]);
  const resource = usePollingResource(load, 0);
  useListPageBounds(page, resource.data?.total, PAGE_SIZE, setSearch);
  const users = resource.data?.items ?? [];
  const total = resource.data?.total ?? 0;
  const isLoading = resource.loading;

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(current => updateQuery(current, { page: null, query: searchText.trim() || null }), { preventScrollReset: true });
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" sx={{ mb: 4 }}>
          <Box>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.75 }}>
              <ManageAccountsRoundedIcon color="primary" />
              <Typography component="h1" variant="h3">User management</Typography>
            </Stack>
            <Typography color="text.secondary">Review accounts, access levels, and active status.</Typography>
          </Box>
          <Stack component="form" direction="row" onSubmit={handleSearch} spacing={1} sx={{ alignSelf: { sm: "flex-end" } }}>
            <TextField
              size="small"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Name or email"
              aria-label="Search users"
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }}
            />
            <Button type="submit" variant="contained">Search</Button>
          </Stack>
        </Stack>

        <ResourceNotice {...resource} />
        {isLoading ? (
          <Box role="status" aria-label="Loading users" sx={{ py: 10, display: "grid", placeItems: "center" }}>
            <CircularProgress size={34} />
          </Box>
        ) : resource.data ? (
          <>
            <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: "none", md: "block" }, borderRadius: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Access</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Subscription plan</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((listedUser) => (
                    <TableRow key={listedUser.id} hover>
                      <TableCell><Typography fontWeight={700}>{listedUser.full_name}</Typography></TableCell>
                      <TableCell>{listedUser.email}</TableCell>
                      <TableCell><UserRoleChip user={listedUser} /></TableCell>
                      <TableCell>{listedUser.closure_state ? closureLabels[listedUser.closure_state] : listedUser.is_active ? "Active" : "Inactive"}</TableCell>
                      <TableCell>{listedUser.subscription_plan_name ?? "No subscription"}</TableCell>
                      <TableCell align="right">
                        <Button component={RouterLink} to={withReturnTo(`/admin/users/${listedUser.id}`, returnTo)} endIcon={<ChevronRightRoundedIcon />}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
              {users.map((listedUser) => (
                <Paper key={listedUser.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={750}>{listedUser.full_name}</Typography>
                      <Typography color="text.secondary" sx={{ overflowWrap: "anywhere", mb: 1.5 }}>{listedUser.email}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <UserRoleChip user={listedUser} />
                        <Typography variant="body2">Plan: {listedUser.subscription_plan_name ?? "No subscription"}</Typography>
                        <Typography variant="body2" color={listedUser.is_active ? "success.main" : "text.secondary"}>
                          {listedUser.closure_state ? closureLabels[listedUser.closure_state] : listedUser.is_active ? "Active" : "Inactive"}
                        </Typography>
                      </Stack>
                    </Box>
                    <Button component={RouterLink} to={withReturnTo(`/admin/users/${listedUser.id}`, returnTo)} aria-label={`View ${listedUser.full_name}`} sx={{ minWidth: 40 }}>
                      <ChevronRightRoundedIcon />
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            {users.length === 0 && (
              <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}>
                <Typography variant="h6">No users found</Typography>
                <Typography color="text.secondary">Try a different name or email.</Typography>
              </Paper>
            )}

            {total > PAGE_SIZE && (
              <Pagination
                count={pageCount}
                page={page}
                onChange={(_event, nextPage) => setPage(nextPage)}
                color="primary"
                sx={{ mt: 3, display: "flex", justifyContent: "center" }}
              />
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
              {total} {total === 1 ? "account" : "accounts"}
            </Typography>
          </>
        ) : null}
      </Container>
    </Box>
  );
}
