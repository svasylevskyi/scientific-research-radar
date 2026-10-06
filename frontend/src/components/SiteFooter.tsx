import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./Brand";

export function SiteFooter() {
  const { user } = useAuth();
  const links = [
    { label: "Home", to: "/" },
    { label: "Subscription Plans", to: "/plans" },
    ...(user ? [{ label: "Your Radar", to: "/radar" }] : []),
    { label: "About", to: "/about" },
    { label: "Contact", to: user ? "/radar/contact" : "/contact" },
    { label: "Privacy", to: "/privacy" },
    { label: "Terms", to: "/terms" },
  ];

  return (
    <Box component="footer" sx={{ bgcolor: "#071a2b", color: "#c0ced7", py: { xs: 4, md: 5 } }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={4}>
          <Box>
            <Box component={RouterLink} to="/" sx={{ textDecoration: "none" }}><Brand light compact /></Box>
            <Typography variant="body2" sx={{ mt: 2 }}>Your curiosity. A clearer view of the evidence.</Typography>
          </Box>
          <Stack
            component="nav"
            aria-label="Footer navigation"
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            rowGap={1}
            sx={{
              minWidth: 0,
              whiteSpace: "nowrap",
            }}
          >
            {links.map((item, index) => (
              <Stack key={item.label} direction="row" alignItems="center" flexShrink={0}>
                {index > 0 && (
                  <Typography component="span" aria-hidden="true" color="#708391" sx={{ mx: 1.5 }}>
                    •
                  </Typography>
                )}
                <Link component={RouterLink} to={item.to} color="inherit" underline="hover">
                  {item.label}
                </Link>
              </Stack>
            ))}
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
