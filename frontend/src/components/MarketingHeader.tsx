import { Box, Button, Container, Stack } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";

export function RadarLink() {
  const { user, isInitializing } = useAuth();
  if (isInitializing) {
    return <Button variant="contained" disabled>Restoring your session…</Button>;
  }
  return user ? (
    <Button component={RouterLink} to="/radar" variant="contained">Open your radar ↗</Button>
  ) : (
    <Button component={RouterLink} to="/login" state={{ from: "/radar" }} variant="contained">Sign in to Radar ↗</Button>
  );
}

export function MarketingHeader() {
  return (
    <Box component="header" sx={{ bgcolor: "#fff", borderBottom: "1px solid", borderColor: "divider" }}>
      <Container maxWidth="lg" sx={{ py: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box component={RouterLink} to="/" aria-label="Scientific Research Radar home" sx={{ textDecoration: "none" }}><Brand compact /></Box>
        <Stack component="nav" aria-label="Main navigation" direction="row" alignItems="center" spacing={2}>
          <Button component={RouterLink} to="/plans" color="inherit">Plans</Button>
          <RadarLink />
        </Stack>
      </Container>
    </Box>
  );
}
