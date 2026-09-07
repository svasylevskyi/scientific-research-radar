import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { Link as RouterLink, Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isValidNewPassword, passwordRequirementsText } from "../auth/passwordRequirements";
import { AuthLayout } from "../layouts/AuthLayout";
import { authApi } from "../api/auth";
import { EmailVerificationForm, type EmailVerification } from "../components/EmailVerificationForm";

export function RegisterPage() {
  const { user, isInitializing, register, confirmRegistration } = useAuth();
  const [challenge, setChallenge] = useState<EmailVerification | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("registrationVerification") ?? "null"); }
    catch { return null; }
  });
  function rememberChallenge(value: EmailVerification | null) {
    setChallenge(value);
    if (value) sessionStorage.setItem("registrationVerification", JSON.stringify(value));
    else sessionStorage.removeItem("registrationVerification");
  }
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isInitializing && user) return <Navigate to="/radar" replace />;

  const passwordIsValid = isValidNewPassword(password);
  const passwordsMatch = password === passwordConfirmation;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmationTouched(true);
    if (!passwordIsValid || !passwordsMatch) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const pending = await register({
        full_name: fullName,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      rememberChallenge(pending);
      setPassword(""); setPasswordConfirmation("");
    } catch (caught) {
      if (
        caught instanceof ApiError
        && caught.status === 422
        && caught.message.toLowerCase().includes("email")
      ) {
        setError("Email address is not valid");
      } else {
        setError(caught instanceof ApiError ? caught.message : "Could not create the account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <Box component="header" sx={{ mb: 4 }}>
        <Typography component="h2" variant="h3" sx={{ mb: 1.25 }}>
          Create your account
        </Typography>
        <Typography color="text.secondary">Start a focused workspace for the science you follow.</Typography>
      </Box>

      {challenge ? <EmailVerificationForm challenge={challenge} registration
        onConfirm={async (code) => {
          await confirmRegistration(challenge.id, code);
          rememberChallenge(null);
          navigate("/radar", { replace: true });
        }}
        onResend={async () => rememberChallenge(await authApi.resendRegistration(challenge.id))}
        onCancel={() => rememberChallenge(null)} /> : (
      <Stack component="form" onSubmit={handleSubmit} spacing={2.25} noValidate>
        <Alert severity="info">We will send a 6-digit verification code to your email. Confirm within 24 hours to create your account; otherwise the registration attempt is removed. You can resend the code after 1 minute.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Full name"
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
        />
        <Box>
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            helperText={passwordRequirementsText}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((visible) => !visible)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        <TextField
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          onBlur={() => setConfirmationTouched(true)}
          error={confirmationTouched && !passwordsMatch}
          helperText={confirmationTouched && !passwordsMatch ? "Passwords do not match." : " "}
          required
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                    onClick={() => setShowPassword((visible) => !visible)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting || !fullName || !email || !passwordIsValid || !passwordsMatch}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ minHeight: 52 }}
        >
          {isSubmitting ? "Sending code…" : "Continue to email verification"}
        </Button>
      </Stack>)}

      <Typography sx={{ mt: 3.5, color: "text.secondary" }}>
        Already have an account?{" "}
        <Link component={RouterLink} to="/login" fontWeight={700} underline="hover">
          Sign in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
