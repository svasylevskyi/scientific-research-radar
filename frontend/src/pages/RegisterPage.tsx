import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import {
  Alert,
  Box,
  Button,
  FormHelperText,
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
import { AuthLayout } from "../layouts/AuthLayout";

export function RegisterPage() {
  const { user, isInitializing, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isInitializing && user) return <Navigate to="/" replace />;

  const passwordIsValid = password.length >= 8;
  const passwordsMatch = password === passwordConfirmation;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmationTouched(true);
    if (!passwordIsValid || !passwordsMatch) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        full_name: fullName,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      navigate("/", { replace: true });
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

      <Stack component="form" onSubmit={handleSubmit} spacing={2.25} noValidate>
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
          <FormHelperText sx={{ ml: 1.75 }}>Use at least 8 characters.</FormHelperText>
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
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </Stack>

      <Typography sx={{ mt: 3.5, color: "text.secondary" }}>
        Already have an account?{" "}
        <Link component={RouterLink} to="/login" fontWeight={700} underline="hover">
          Sign in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
