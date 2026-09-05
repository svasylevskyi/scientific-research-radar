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
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "../layouts/AuthLayout";

export function LoginPage() {
  const { user, isInitializing, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordChanged = Boolean(
    (location.state as { passwordChanged?: boolean } | null)?.passwordChanged,
  );

  if (!isInitializing && user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      const destination = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(destination, { replace: true });
    } catch {
      setError("Email or password is incorrect.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <Box component="header" sx={{ mb: 4 }}>
        <Typography component="h2" variant="h3" sx={{ mb: 1.25 }}>
          Welcome back
        </Typography>
        <Typography color="text.secondary">Sign in to continue to your research workspace.</Typography>
      </Box>

      <Stack component="form" onSubmit={handleSubmit} spacing={2.25} noValidate>
        {passwordChanged && (
          <Alert severity="success">Password changed successfully. Sign in with your new password.</Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
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
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting || !email || !password}
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ minHeight: 52 }}
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>

      <Typography sx={{ mt: 3.5, color: "text.secondary" }}>
        New to Research Radar?{" "}
        <Link component={RouterLink} to="/register" fontWeight={700} underline="hover">
          Create an account
        </Link>
      </Typography>
    </AuthLayout>
  );
}
