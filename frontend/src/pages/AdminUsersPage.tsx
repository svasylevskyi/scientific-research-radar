import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import { useListPageBounds } from "../hooks/useListPageBounds";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Alert, Box, Button, CircularProgress, Container, InputAdornment, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { pageNumber, queryPath, updateQuery, withReturnTo } from "../navigationContext";
import { safeSupportReturn } from "../admin/support";
import { adminApi } from "../api/admin";
import { AppHeader } from "../components/AppHeader";
import { UserRoleChip } from "../components/UserRoleChip";
import { AccountStatusChip, AdminListFooter, AdminPageHeading, AdminSupportReturn } from "../components/AdminSupport";

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
  const origin = safeSupportReturn(search.get("support_return"));
  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(current => updateQuery(current, { page: null, query: searchText.trim() || null }), { preventScrollReset: true });
  }
  function clearSearch() {
    setSearchText("");
    setSearch(current => updateQuery(current, { page: null, query: null }), { preventScrollReset: true });
  }
  return <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
    <AppHeader />
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, sm: 6 } }}>
      <AdminSupportReturn />
      <AdminPageHeading title="User management" icon={<ManageAccountsRoundedIcon color="primary" />}
        description="Review accounts, access levels, active status, and reported subscription plans."
        actions={<>
          <Stack component="form" direction="row" onSubmit={handleSearch} spacing={1} useFlexGap flexWrap="wrap"
            sx={{ flex: "1 1 420px", minWidth: 0 }}>
            <TextField size="small" label="Name or email" value={searchText} onChange={event => setSearchText(event.target.value)}
              helperText="Search up to 120 characters." sx={{ flex: "1 1 220px", minWidth: 0 }}
              slotProps={{ htmlInput: { maxLength: 120 }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} />
            <Button type="submit" variant="contained" sx={{ minHeight: 40 }}>Search</Button>
            {(query || searchText) && <Button type="button" onClick={clearSearch} sx={{ minHeight: 40 }}>Clear search</Button>}
          </Stack>
          <Button disabled={isLoading || resource.retrying || resource.retryAt > Date.now()} onClick={() => void resource.refresh()} sx={{ minHeight: 40 }}>Refresh</Button>
        </>} />
      {origin?.split("?")[0] === "/admin/messages" && <Alert severity="info" role="note" sx={{ mb: 2 }}>
        This search uses visitor-supplied contact details. A matching account does not verify the sender’s identity.
      </Alert>}
      <ResourceNotice {...resource} />
      {isLoading ? <Box role="status" aria-label="Loading users" sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress size={34} /></Box>
        : resource.data ? <>
          {users.length > 0 ? <>
            <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: "none", md: "block" }, borderRadius: 3 }}>
              <Table aria-label="User accounts" sx={{ "& th, & td": { overflowWrap: "anywhere" } }}>
                <TableHead><TableRow>{["Name", "Email", "Access", "Status", "Subscription plan", "Actions"].map(label =>
                  <TableCell key={label} scope="col" align={label === "Actions" ? "right" : "left"}>{label}</TableCell>)}</TableRow></TableHead>
                <TableBody>{users.map(listedUser => <TableRow key={listedUser.id} hover>
                  <TableCell component="th" scope="row"><Typography fontWeight={700}>{listedUser.full_name}</Typography></TableCell>
                  <TableCell>{listedUser.email}</TableCell>
                  <TableCell><UserRoleChip user={listedUser} /></TableCell>
                  <TableCell><AccountStatusChip user={listedUser} /></TableCell>
                  <TableCell>{listedUser.subscription_plan_name ?? "No subscription"}</TableCell>
                  <TableCell align="right"><Button component={RouterLink} to={withReturnTo(`/admin/users/${listedUser.id}`, returnTo)}
                    aria-label={`View user ${listedUser.full_name}`} endIcon={<ChevronRightRoundedIcon />}>View user</Button></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>
            <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>{users.map(listedUser =>
              <Paper key={listedUser.id} variant="outlined" sx={{ p: 2.25, borderRadius: 3, overflowWrap: "anywhere" }}>
                <Typography fontWeight={750}>{listedUser.full_name}</Typography>
                <Typography color="text.secondary" sx={{ mb: 1.5 }}>{listedUser.email}</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <UserRoleChip user={listedUser} /><AccountStatusChip user={listedUser} />
                </Stack>
                <Typography variant="body2" sx={{ my: 1.5 }}>Plan: {listedUser.subscription_plan_name ?? "No subscription"}</Typography>
                <Button component={RouterLink} to={withReturnTo(`/admin/users/${listedUser.id}`, returnTo)}
                  aria-label={`View user ${listedUser.full_name}`} endIcon={<ChevronRightRoundedIcon />}>View user</Button>
              </Paper>)}</Stack>
          </> : <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: "center", borderRadius: 3 }}>
            <Typography variant="h6">{query ? "No matching users" : "No user accounts to display"}</Typography>
            <Typography color="text.secondary">{query ? "Try a different name or email, or clear the search." : "Accessible accounts will appear here when available."}</Typography>
            {query && <Button onClick={clearSearch} sx={{ mt: 1 }}>Clear search</Button>}
          </Paper>}
          <AdminListFooter page={page} pageSize={PAGE_SIZE} total={total} count={users.length} noun="accounts" onChange={setPage} />
        </> : null}
    </Container>
  </Box>;
}
