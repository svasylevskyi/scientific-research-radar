import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import {
  Alert,
  Box,
  Button,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { usersApi } from "../api/users";
import { useAuth } from "../auth/AuthContext";
import { isValidNewPassword, passwordRequirementsText } from "../auth/passwordRequirements";
import { AppHeader } from "../components/AppHeader";
import { EmailVerificationForm, type EmailVerification } from "../components/EmailVerificationForm";

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<EmailVerification | null>(null);

  useEffect(() => {
    let active = true;
    usersApi.pendingEmail().then((pending) => { if (active) setChallenge(pending); })
      .catch(() => { if (active) setProfileError("Could not load pending email verification. Please reload the page."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setFullName(user?.full_name ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  const newPasswordIsValid = isValidNewPassword(newPassword);
  const passwordsMatch = newPassword === newPasswordConfirmation;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);
    try {
      const requestedEmail = email.trim().toLowerCase();
      await usersApi.updateProfile({ full_name: fullName, email: user!.email });
      if (requestedEmail !== user!.email) {
        setChallenge(await usersApi.startEmailChange(requestedEmail));
        setProfileSuccess("Name saved. Confirm the code sent to your new email to finish the email change.");
      } else {
        setProfileSuccess("Profile details updated.");
      }
      await refreshUser();
    } catch (caught) {
      setProfileError(caught instanceof ApiError ? caught.message : "Could not update your profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmationTouched(true);
    if (!newPasswordIsValid || !passwordsMatch) return;
    setPasswordError(null);
    setIsChangingPassword(true);
    try {
      await usersApi.updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      });
      await logout();
      navigate("/login", { replace: true, state: { passwordChanged: true } });
    } catch (caught) {
      setPasswordError(caught instanceof ApiError ? caught.message : "Could not change your password.");
      setIsChangingPassword(false);
    }
  }

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton
        aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
        onClick={() => setShowPasswords((visible) => !visible)}
        edge="end"
      >
        {showPasswords ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
      </IconButton>
    </InputAdornment>
  );

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
        <Typography component="h1" variant="h3" sx={{ mb: 1 }}>Your profile</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Manage your account details and sign-in credentials.
        </Typography>

        <Stack spacing={3}>
          {challenge && <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <EmailVerificationForm key={challenge.id} challenge={challenge}
              onConfirm={async (code) => {
                await usersApi.confirmEmailChange(challenge.id, code);
                setChallenge(null);
                await refreshUser();
                setProfileSuccess("Email address verified and updated. Use your new email to sign in.");
              }}
              onResend={async () => setChallenge(await usersApi.resendEmailChange(challenge.id))}
              onCancel={() => setChallenge(null)} />
          </Paper>}

          <Paper component="form" onSubmit={saveProfile} variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>Profile details</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>Update the name and email address associated with your account.</Typography>
            <Stack spacing={2.25}>
              {profileError && <Alert severity="error">{profileError}</Alert>}
              {profileSuccess && <Alert severity="success">{profileSuccess}</Alert>}
              <TextField label="Full name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required fullWidth />
              <TextField label="Email address" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth
                helperText="We will send a verification code to your email." />
              <Button type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={isSavingProfile || !fullName || !email} sx={{ alignSelf: "flex-start" }}>
                {isSavingProfile ? "Saving…" : "Save details"}
              </Button>
            </Stack>
          </Paper>

          <Paper component="form" onSubmit={changePassword} variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>Change password</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>You will be signed out here, and refresh sessions on other devices will be revoked.</Typography>
            <Stack spacing={2.25}>
              {passwordError && <Alert severity="error">{passwordError}</Alert>}
              <TextField
                label="Current password"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                fullWidth
                slotProps={{ input: { endAdornment: passwordAdornment } }}
              />
              <TextField
                label="New password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                helperText={passwordRequirementsText}
                required
                fullWidth
                slotProps={{ input: { endAdornment: passwordAdornment } }}
              />
              <TextField
                label="Confirm new password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                value={newPasswordConfirmation}
                onChange={(event) => setNewPasswordConfirmation(event.target.value)}
                onBlur={() => setConfirmationTouched(true)}
                error={confirmationTouched && !passwordsMatch}
                helperText={confirmationTouched && !passwordsMatch ? "Passwords do not match." : " "}
                required
                fullWidth
                slotProps={{ input: { endAdornment: passwordAdornment } }}
              />
              <Button
                type="submit"
                variant="contained"
                startIcon={<LockResetRoundedIcon />}
                disabled={isChangingPassword || !currentPassword || !newPasswordIsValid || !passwordsMatch}
                sx={{ alignSelf: "flex-start" }}
              >
                {isChangingPassword ? "Changing password…" : "Change password"}
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
