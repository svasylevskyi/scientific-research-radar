import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { adminApi } from "../api/admin";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { UserRoleChip } from "../components/UserRoleChip";
import type { User, UserRole } from "../types/auth";

export function AdminUserDetailPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, refreshUser } = useAuth();
  const [managedUser, setManagedUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .getUser(userId)
      .then((result) => {
        if (!active) return;
        setManagedUser(result);
        setFullName(result.full_name);
        setEmail(result.email);
        setIsActive(result.is_active);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof ApiError ? caught.message : "Could not load this user.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const isSelf = managedUser?.id === currentUser?.id;
  const isProtected = Boolean(managedUser?.is_super_admin || isSelf);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await adminApi.updateUser(userId, {
        full_name: fullName,
        email,
        is_active: isActive,
      });
      setManagedUser(updated);
      setSuccess("User details updated.");
      if (isSelf) await refreshUser();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update this user.");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeRole(role: UserRole) {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await adminApi.updateRole(userId, role);
      setManagedUser(updated);
      setSuccess(role === "admin" ? "User promoted to admin." : "Admin demoted to user.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not change this user's role.");
    } finally {
      setIsSaving(false);
      setPendingRole(null);
    }
  }

  async function deleteUser() {
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.deleteUser(userId);
      navigate("/admin/users", { replace: true });
    } catch (caught) {
      setConfirmDelete(false);
      setError(caught instanceof ApiError ? caught.message : "Could not delete this user.");
      setIsSaving(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button component={RouterLink} to="/admin/users" color="inherit" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 2 }}>
          Back to users
        </Button>
        {isLoading ? (
          <Box role="status" aria-label="Loading user" sx={{ py: 10, display: "grid", placeItems: "center" }}><CircularProgress size={34} /></Box>
        ) : !managedUser ? (
          <Alert severity="error">{error ?? "User not found."}</Alert>
        ) : (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 3 }}>
              <Box>
                <Typography component="h1" variant="h3" sx={{ mb: 0.75 }}>{managedUser.full_name}</Typography>
                <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{managedUser.email}</Typography>
              </Box>
              <UserRoleChip user={managedUser} />
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2.5 }}>{success}</Alert>}
            {managedUser.is_super_admin && (
              <Alert severity="info" sx={{ mb: 2.5 }}>This is the protected system super-admin. It must remain active and cannot be demoted or deleted.</Alert>
            )}
            {isSelf && !managedUser.is_super_admin && (
              <Alert severity="info" sx={{ mb: 2.5 }}>You can edit your details, but you cannot deactivate, demote, or delete your own admin account.</Alert>
            )}

            <Paper variant="outlined" sx={{ p: 2.25, mb: 2, borderRadius: 3 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Account ID</Typography>
                  <Typography sx={{ overflowWrap: "anywhere" }}>{managedUser.id}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(managedUser.created_at))}</Typography>
                </Box>
              </Stack>
            </Paper>

            <Paper component="form" onSubmit={saveDetails} variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ mb: 2.5 }}>Account details</Typography>
              <Stack spacing={2.25}>
                <TextField label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required fullWidth />
                <TextField label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth />
                <FormControlLabel
                  control={<Switch checked={isActive} onChange={(event) => setIsActive(event.target.checked)} disabled={isProtected} />}
                  label={isActive ? "Account is active" : "Account is inactive"}
                />
                <Button type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={isSaving || !fullName || !email} sx={{ alignSelf: "flex-start" }}>
                  Save details
                </Button>
              </Stack>

              <Divider sx={{ my: 3.5 }} />
              <Typography variant="h6" sx={{ mb: 0.75 }}>Access level</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Admins can view and manage all user accounts.
              </Typography>
              <Button
                variant="outlined"
                disabled={isSaving || isProtected}
                onClick={() => setPendingRole(managedUser.role === "admin" ? "user" : "admin")}
              >
                {managedUser.role === "admin" ? "Demote to user" : "Promote to admin"}
              </Button>

              <Divider sx={{ my: 3.5 }} />
              <Typography variant="h6" color="error.main" sx={{ mb: 0.75 }}>Delete account</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Permanently removes the user and all of their active sessions.
              </Typography>
              <Button color="error" variant="outlined" startIcon={<DeleteOutlineRoundedIcon />} disabled={isSaving || isProtected} onClick={() => setConfirmDelete(true)}>
                Delete user
              </Button>
            </Paper>
          </>
        )}
      </Container>

      <Dialog
        open={pendingRole !== null}
        onClose={() => {
          if (!isSaving) setPendingRole(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {pendingRole === "admin" ? "Promote this user to admin?" : "Demote this admin to user?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingRole === "admin"
              ? `${managedUser?.full_name ?? "This user"} will be able to view and manage all user accounts.`
              : `${managedUser?.full_name ?? "This admin"} will lose access to the administration section and user management.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPendingRole(null)} disabled={isSaving}>Cancel</Button>
          <Button
            color={pendingRole === "admin" ? "primary" : "warning"}
            variant="contained"
            onClick={() => pendingRole && changeRole(pendingRole)}
            disabled={isSaving || pendingRole === null}
          >
            {pendingRole === "admin" ? "Promote to admin" : "Demote to user"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this user?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {managedUser ? `${managedUser.full_name}'s account will be permanently deleted. This action cannot be undone.` : "This account will be permanently deleted."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)} disabled={isSaving}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteUser} disabled={isSaving}>Delete permanently</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
