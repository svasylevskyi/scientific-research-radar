import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import { AppBar, Avatar, Box, Button, Chip, Container, Paper, Stack, Toolbar, Typography } from "@mui/material";
import { useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    await logout();
  }

  const initials = user?.full_name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar sx={{ minHeight: { xs: 68, sm: 76 } }}>
          <Container maxWidth="lg" disableGutters sx={{ display: "flex", alignItems: "center" }}>
            <Brand compact />
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ width: 38, height: 38, bgcolor: "primary.dark", fontSize: "0.85rem", fontWeight: 800 }}>
                {initials}
              </Avatar>
              <Button
                color="inherit"
                onClick={handleLogout}
                disabled={isSigningOut}
                startIcon={<LogoutRoundedIcon />}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                Sign out
              </Button>
              <Button
                color="inherit"
                onClick={handleLogout}
                disabled={isSigningOut}
                aria-label="Sign out"
                sx={{ display: { xs: "inline-flex", sm: "none" }, minWidth: 44 }}
              >
                <LogoutRoundedIcon />
              </Button>
            </Stack>
          </Container>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 5, sm: 8 } }}>
        <Chip label="Foundation ready" color="primary" size="small" sx={{ mb: 2, fontWeight: 750 }} />
        <Typography component="h1" variant="h2" sx={{ mb: 1.5 }}>
          Welcome, {user?.full_name.split(" ")[0]}.
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 660, fontSize: "1.08rem", mb: 5 }}>
          Your account is active and this workspace is protected. We can now build the research monitoring workflow on top of it.
        </Typography>

        <Paper
          variant="outlined"
          sx={{
            maxWidth: 620,
            p: { xs: 2.5, sm: 3.5 },
            borderRadius: 4,
            backgroundImage: "linear-gradient(145deg, rgba(31, 181, 147, 0.07), rgba(255,255,255,0) 50%)",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "center" }}>
            <Box
              sx={{
                width: 54,
                height: 54,
                flex: "0 0 auto",
                borderRadius: 3,
                display: "grid",
                placeItems: "center",
                bgcolor: "rgba(31, 181, 147, 0.12)",
                color: "primary.dark",
              }}
            >
              <SecurityRoundedIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ mb: 0.5 }}>Authenticated session</Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                Signed in as {user?.email}. Access tokens renew through a protected, revocable session.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

