import { ResourceNotice } from "../components/ResourceNotice";
import { usePollingResource } from "../hooks/usePollingResource";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import { Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";
import { listReturnTo, queryPath } from "../navigationContext";
import { accountDraft, adminDate, hasAccountEdits, receiveAccount, withSupportReturn, type AccountDraft, type AccountEditor } from "../admin/support";
import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { CloseAccountDialog } from "../components/CloseAccountDialog";
import { AdminAccountClosure } from "../components/AdminAccountClosure";
import { UserRoleChip } from "../components/UserRoleChip";
import { AccountStatusChip, AdminPageHeading, AdminSupportReturn } from "../components/AdminSupport";
import type { UserRole } from "../types/auth";

type Issue = { kind: "save" | "role"; text: string; fields?: ("full_name" | "email")[] };
export function AdminUserDetailPage() {
  const { userId = "" } = useParams();
  // Route changes must not carry one account's draft or confirmation to another.
  return <ManagedUserPage key={userId} userId={userId} />;
}
export function ManagedUserPage({ userId }: { userId: string }) {
  const [search] = useSearchParams();
  const { user: currentUser, refreshUser } = useAuth();
  const [editor, setEditor] = useState<AccountEditor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = useRef(false);
  const revision = useRef(0);
  const alive = useRef(true);
  const noticeRef = useRef<HTMLDivElement>(null);
  const roleErrorRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    const readRevision = revision.current;
    return { user: await adminApi.getUser(userId, signal), revision: readRevision };
  }, [userId]);
  const resource = usePollingResource(load, 0);
  useEffect(() => {
    if (!resource.data || locked.current || resource.data.revision !== revision.current) return;
    setEditor(current => receiveAccount(current, resource.data!.user));
  }, [resource.data]);
  useEffect(() => {
    if (!issue) return;
    const target = issue.kind === "role" ? roleErrorRef.current : noticeRef.current;
    target?.scrollIntoView({ block: "nearest" });
    target?.focus({ preventScroll: true });
  }, [issue]);
  const managedUser = editor?.user ?? null;
  const isSelf = managedUser?.id === currentUser?.id;
  const isProtected = Boolean(managedUser?.is_super_admin || isSelf);
  const canManage = !!currentUser && (currentUser.role === "admin" || currentUser.is_super_admin) &&
    (!managedUser?.is_super_admin || currentUser.is_super_admin);
  const unavailable = !managedUser || !canManage || !!managedUser.closure_state || !!resource.error;
  const dirty = !!editor && hasAccountEdits(editor);
  const detailPath = queryPath(`/admin/users/${encodeURIComponent(userId)}`, search);

  function edit<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    if (locked.current || unavailable || confirmDelete || pendingRole) return;
    if (key === "is_active" && isProtected) return;
    setEditor(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : current);
    setIssue(null); setSuccess(null);
  }
  function focusField(key: "full_name" | "email") {
    const input = key === "full_name" ? nameRef.current : emailRef.current;
    input?.scrollIntoView({ block: "center" }); input?.focus({ preventScroll: true });
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!editor || locked.current || unavailable || confirmDelete || pendingRole) return;
    const fields: ("full_name" | "email")[] = [];
    if (editor.draft.full_name.trim().replace(/\s+/g, " ").length < 2 || editor.draft.full_name.length > 120) fields.push("full_name");
    if (!editor.draft.email.trim() || emailRef.current?.validity.typeMismatch) fields.push("email");
    if (fields.length) { setIssue({ kind: "save", text: "Check the highlighted account fields before saving.", fields }); return; }
    locked.current = true; revision.current += 1;
    setIsSaving(true); setIssue(null); setSuccess(null);
    try {
      const updated = await adminApi.updateUser(userId, { ...editor.draft,
        is_active: isProtected ? managedUser!.is_active : editor.draft.is_active });
      revision.current += 1;
      if (!alive.current) return;
      setEditor({ user: updated, draft: accountDraft(updated) });
      setSuccess("User details updated.");
      if (isSelf) {
        try { await refreshUser(); }
        catch { if (alive.current) setSuccess("User details were saved. Your signed-in profile could not refresh; reload before making further account changes."); }
      }
    } catch (caught) {
      if (alive.current) setIssue({ kind: "save", text: caught instanceof ApiError ? caught.message : "Could not update this user. Your edits are still shown; check the refreshed account before retrying." });
    } finally {
      locked.current = false;
      if (alive.current) { setIsSaving(false); void resource.refresh(); }
    }
  }
  async function changeRole(role: UserRole) {
    if (!managedUser || locked.current || unavailable || isProtected || pendingRole !== role || confirmDelete) return;
    locked.current = true; revision.current += 1;
    setIsSaving(true); setIssue(null); setSuccess(null);
    try {
      const updated = await adminApi.updateRole(userId, role);
      revision.current += 1;
      if (!alive.current) return;
      setEditor(current => receiveAccount(current, updated));
      setSuccess(role === "admin" ? "User promoted to admin." : "Admin demoted to user.");
      setPendingRole(null);
    } catch (caught) {
      if (alive.current) setIssue({ kind: "role", text: caught instanceof ApiError ? caught.message : "Could not change this user's role. Check the refreshed account before retrying." });
    } finally {
      locked.current = false;
      if (alive.current) { setIsSaving(false); void resource.refresh(); }
    }
  }
  const fieldsDisabled = isSaving || unavailable || confirmDelete || pendingRole !== null;
  const related = [
    ["View user’s digests", `/admin/digests?owner_id=${encodeURIComponent(userId)}`, "Saved research, run history, and diagnostics."],
    ["Subscription access", `/admin/subscription-access?user_id=${encodeURIComponent(userId)}`, "Effective access rules and research allowances."],
    ["Billing synchronization", `/admin/billing-sync?user_id=${encodeURIComponent(userId)}`, "Recorded payment state and billing reconciliation tools."],
    ["Subscription observation", `/admin/subscription-observation?user_id=${encodeURIComponent(userId)}`, "Usage comparisons only; observation assignments do not change billing or enforce access."],
  ] as const;
  return <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}><AppHeader />
    <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Button component={RouterLink} to={listReturnTo(search, "/admin/users")} color="inherit" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 2 }}>Back to users</Button>
        <AdminSupportReturn />
      </Stack>
      <ResourceNotice {...resource} />
      {resource.loading && !editor ? <Box role="status" aria-label="Loading user" sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress size={34} /></Box>
        : !editor || !managedUser ? resource.error ? null : <Typography role="status">Opening user…</Typography> : <>
          <AdminPageHeading title={managedUser.full_name} description={managedUser.email}
            actions={<Button disabled={isSaving || confirmDelete || !!pendingRole || resource.retrying || resource.retryAt > Date.now()}
              onClick={() => void resource.refresh()}>Refresh account</Button>} />
          {issue?.kind === "save" && <Alert ref={noticeRef} tabIndex={-1} severity="error" role="alert" sx={{ mb: 2.5 }}>
            {issue.text}
            {issue.fields?.map(key => <Button key={key} onClick={() => focusField(key)}>{key === "full_name" ? "Full name" : "Email address"}</Button>)}
          </Alert>}
          {success && <Alert severity="success" role="status" sx={{ mb: 2.5 }}>{success}</Alert>}
          {resource.error && <Typography color="text.secondary" sx={{ mb: 2 }}>Account-changing actions are paused until refresh succeeds. Unsaved edits remain in the form.</Typography>}
          {managedUser.is_super_admin && <Alert severity="info" sx={{ mb: 2.5 }}>This is the protected system super-admin. It must remain active and cannot be demoted or deleted.</Alert>}
          {isSelf && !managedUser.is_super_admin && <Alert severity="info" sx={{ mb: 2.5 }}>You can edit your details, but you cannot deactivate, demote, or delete your own admin account.</Alert>}
          <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, mb: 3, borderRadius: 3, overflowWrap: "anywhere" }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Account overview</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}><UserRoleChip user={managedUser} /><AccountStatusChip user={managedUser} /></Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }, gap: 2 }}>
              <Box><Typography variant="body2" color="text.secondary">Account ID</Typography><Typography>{managedUser.id}</Typography></Box>
              <Box><Typography variant="body2" color="text.secondary">Created · your local time</Typography><Typography>{adminDate(managedUser.created_at)}</Typography></Box>
              <Box><Typography variant="body2" color="text.secondary">Reported subscription plan</Typography><Typography>{managedUser.subscription_plan_name ?? "No subscription"}</Typography></Box>
            </Box>
          </Paper>
          <Paper component="section" variant="outlined" sx={{ p: { xs: 2.25, sm: 3 }, mb: 3, borderRadius: 3 }}>
            <Typography component="h2" variant="h6" sx={{ mb: 2 }}>Related information</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              {related.map(([label, path, description]) => <Box key={path} sx={{ minWidth: 0 }}>
                <Button component={RouterLink} to={withSupportReturn(path, detailPath)} sx={{ justifyContent: "flex-start", textAlign: "left" }}>{label}</Button>
                <Typography variant="body2" color="text.secondary">{description}</Typography>
              </Box>)}
            </Box>
          </Paper>
          {managedUser.closure_state ? <AdminAccountClosure userId={userId} /> : <Stack spacing={3}>
            <Paper component="form" noValidate onSubmit={saveDetails} variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
              <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Account details</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Fields marked * are required. Changes take effect only after saving.</Typography>
              <Stack spacing={2.25}>
                <TextField id="managed-full-name" inputRef={nameRef} label="Full name" value={editor.draft.full_name}
                  onChange={event => edit("full_name", event.target.value)} required fullWidth disabled={fieldsDisabled}
                  error={issue?.fields?.includes("full_name")} helperText="Enter 2–120 characters."
                  slotProps={{ htmlInput: { maxLength: 120, minLength: 2 } }} />
                <TextField id="managed-email" inputRef={emailRef} label="Email address" type="email" value={editor.draft.email}
                  onChange={event => edit("email", event.target.value)} required fullWidth disabled={fieldsDisabled}
                  error={issue?.fields?.includes("email")} helperText="Use a valid email address for this account." />
                <FormControlLabel control={<Switch checked={editor.draft.is_active} onChange={event => edit("is_active", event.target.checked)} disabled={fieldsDisabled || isProtected} />}
                  label={editor.draft.is_active ? "Account is active" : "Account is inactive"} />
                {dirty && <Typography variant="body2" color="text.secondary">Unsaved changes are retained while account information refreshes.</Typography>}
                <Button type="submit" variant="contained" startIcon={isSaving ? <CircularProgress size={18} color="inherit" /> : <SaveRoundedIcon />}
                  disabled={fieldsDisabled} sx={{ alignSelf: "flex-start" }}>{isSaving ? "Saving…" : "Save details"}</Button>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
              <Typography component="h2" variant="h6" sx={{ mb: 0.75 }}>Access level</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>{currentUser?.is_super_admin
                ? "Super-admins can manage every account, subject to protected-account restrictions."
                : "Admins can manage user and admin accounts, but not the super-admin."}</Typography>
              <Button variant="outlined" disabled={fieldsDisabled || isProtected}
                onClick={() => { if (!locked.current && !unavailable && !isProtected) { setIssue(null); setPendingRole(managedUser.role === "admin" ? "user" : "admin"); } }}>
                {managedUser.role === "admin" ? "Demote to user" : "Promote to admin"}
              </Button>
            </Paper>
            <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3, borderColor: "error.main" }}>
              <Typography component="h2" variant="h6" color="error.main" sx={{ mb: 0.75 }}>Close account</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>Ends access immediately, cancels Radar subscriptions, and removes personal data through a tracked closure workflow.</Typography>
              <Button color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} disabled={fieldsDisabled || isProtected}
                onClick={() => { if (!locked.current && !unavailable && !isProtected) setConfirmDelete(true); }}>Close account</Button>
            </Paper>
          </Stack>}
        </>}
    </Container>
    <Dialog open={pendingRole !== null} onClose={() => { if (!locked.current) { setPendingRole(null); setIssue(null); } }} fullWidth maxWidth="xs"
      aria-labelledby="change-role-title" aria-describedby="change-role-description">
      <DialogTitle id="change-role-title">{pendingRole === "admin" ? "Promote this user to admin?" : "Demote this admin to user?"}</DialogTitle>
      <DialogContent>
        <Typography fontWeight={700} sx={{ overflowWrap: "anywhere", mb: 1 }}>{managedUser?.full_name} · {managedUser?.email}</Typography>
        <DialogContentText id="change-role-description">{pendingRole === "admin"
          ? "This account will be able to view and manage user and admin accounts. Protected super-admin restrictions still apply."
          : "This account will lose access to the administration section and user management."} Unsaved account-detail edits are not included in this action.</DialogContentText>
        {resource.error && <Alert severity="warning" sx={{ mt: 2 }}>Account information could not refresh. Close this confirmation and refresh before retrying.</Alert>}
        {issue?.kind === "role" && <Alert ref={roleErrorRef} tabIndex={-1} role="alert" severity="error" sx={{ mt: 2 }}>{issue.text}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: "wrap", gap: 1 }}>
        <Button autoFocus onClick={() => { setPendingRole(null); setIssue(null); }} disabled={isSaving}>Cancel</Button>
        <Button color={pendingRole === "admin" ? "primary" : "warning"} variant="contained"
          onClick={() => { if (pendingRole) void changeRole(pendingRole); }} disabled={isSaving || !pendingRole || unavailable || isProtected}>
          {isSaving ? "Saving…" : pendingRole === "admin" ? "Promote to admin" : "Demote to user"}
        </Button>
      </DialogActions>
    </Dialog>
    <CloseAccountDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} userId={userId} name={managedUser?.full_name}
      onAccepted={closure => {
        revision.current += 1;
        setConfirmDelete(false);
        setEditor(current => current ? { user: { ...current.user, is_active: false, closure_state: closure.state },
          draft: { ...current.draft, is_active: false } } : current);
      }} />
  </Box>;
}
