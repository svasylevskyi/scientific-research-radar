import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";

export function SiteFooter() {
  const { user } = useAuth();
  return (
    <Box component="footer" sx={{ bgcolor: "#071a2b", color: "#c0ced7", py: { xs: 4, md: 5 } }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={4}>
          <Box>
            <Box component={RouterLink} to="/" sx={{ textDecoration: "none" }}><Brand light compact /></Box>
            <Typography variant="body2" sx={{ mt: 2 }}>Your curiosity. A clearer view of the evidence.</Typography>
          </Box>
          <Stack component="nav" aria-label="Footer navigation" direction="row" spacing={{ xs: 3, sm: 6 }} flexWrap="wrap" useFlexGap>
            <Stack spacing={1}>
              <Typography color="white" fontWeight={700}>Explore</Typography>
              <Link component={RouterLink} to="/" color="inherit" underline="hover">Home</Link>
              <Link component={RouterLink} to="/plans" color="inherit" underline="hover">Sample plans</Link>
              {user && <Link component={RouterLink} to="/radar" color="inherit" underline="hover">Your radar</Link>}
            </Stack>
            <Stack spacing={1}>
              <Typography color="white" fontWeight={700}>More to come</Typography>
              {["About", "Contact"].map((label) => (
                <Typography key={label} component="span" aria-disabled="true" variant="body2" sx={{ color: "#a5b6c3" }}>{label}</Typography>
              ))}
            </Stack>
            <Stack spacing={1}>
              <Typography color="white" fontWeight={700}>Legal drafts</Typography>
              <Link component={RouterLink} to="/privacy" color="inherit" underline="hover">Privacy</Link>
              <Link component={RouterLink} to="/terms" color="inherit" underline="hover">Terms</Link>
            </Stack>
          </Stack>
        </Stack>
        <Box sx={{ mt: 4, pt: 2.5, borderTop: "1px solid #2c3e4d", display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="caption">© {new Date().getFullYear()} Scientific Research Radar</Typography>
          <Typography variant="caption">AI-assisted research. Always consult the original sources.</Typography>
        </Box>
      </Container>
    </Box>
  );
}
