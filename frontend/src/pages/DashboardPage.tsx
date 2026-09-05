import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import { Box, Button, Container, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 5, sm: 8 } }}>
        <Typography component="h1" variant="h2" sx={{ mb: 3 }}>
          Welcome, {user?.full_name.split(" ")[0]}.
        </Typography>
        <Button
          component={RouterLink}
          to="/digests/new"
          variant="contained"
          size="large"
          startIcon={<TravelExploreRoundedIcon />}
          sx={{ minHeight: 48 }}
        >
          Create research digest
        </Button>
      </Container>
    </Box>
  );
}
