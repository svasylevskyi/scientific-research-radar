import { Box, Button, Container } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";
import { MainMenuLink } from "./MainMenuLink";
import { ResponsiveMainMenu, type MainMenuItem } from "./ResponsiveMainMenu";

export function RadarLink() {
  const { user, isInitializing } = useAuth();
  if (isInitializing) {
    return <Button variant="contained" disabled>Restoring your session…</Button>;
  }
  return user ? (
    <Button component={RouterLink} to="/radar" variant="contained">Open your radar ↗</Button>
  ) : (
    <Button component={RouterLink} to="/radar/login" state={{ from: "/radar" }} variant="contained">Sign in to Radar ↗</Button>
  );
}

export function MarketingHeader() {
  const { user, isInitializing } = useAuth();
  const accountItem: MainMenuItem = isInitializing
    ? { label: "Restoring your session…", disabled: true, emphasized: true }
    : user
      ? { label: "Open your radar", to: "/radar", emphasized: true }
      : { label: "Sign in to Radar", to: "/radar/login", state: { from: "/radar" }, emphasized: true };
  return (
    <Box component="header" sx={{ bgcolor: "#fff", borderBottom: "1px solid", borderColor: "divider" }}>
      <Container maxWidth="lg" sx={{ py: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Box component={MainMenuLink} to="/" aria-label="Scientific Research Radar home" sx={{ textDecoration: "none" }}><Brand compact /></Box>
        <ResponsiveMainMenu label="Main navigation" items={[
          { label: "Plans", to: "/plans" },
          { label: "About", to: "/about" },
          { label: "Contact", to: user ? "/radar/contact" : "/contact" },
        ]} accountItems={[accountItem]} />
      </Container>
    </Box>
  );
}
