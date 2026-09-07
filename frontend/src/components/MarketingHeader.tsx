import { Box, Button, Container, Stack, Tooltip } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";

export function RadarLink() {
  const { user, isInitializing } = useAuth();
  return user ? (
    <Button component={RouterLink} to="/radar" variant="contained">Open your radar ↗</Button>
  ) : (
    <Tooltip title={isInitializing ? "Restoring your session" : "Preview only. Radar access is available to signed-in users."}>
      <span><Button variant="contained" disabled>Open your radar ↗</Button></span>
    </Tooltip>
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
