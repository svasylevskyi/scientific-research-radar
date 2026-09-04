import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import { Box, Container, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";

import { Brand } from "../components/Brand";

const benefits = [
  { icon: LibraryBooksRoundedIcon, label: "Monitor the research that matters" },
  { icon: AutoAwesomeRoundedIcon, label: "Turn papers into useful evidence" },
  { icon: TimelineRoundedIcon, label: "See signals and trends earlier" },
];

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: { md: "minmax(320px, 0.9fr) 1.1fr" } }}>
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          p: { md: 5, lg: 7 },
          color: "white",
          bgcolor: "#071a2b",
          backgroundImage:
            "radial-gradient(circle at 12% 24%, rgba(38, 211, 174, 0.18), transparent 25%), radial-gradient(circle at 88% 80%, rgba(68, 138, 255, 0.16), transparent 30%)",
          overflow: "hidden",
        }}
      >
        <Brand light />
        <Box sx={{ maxWidth: 520, py: 6 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { md: "2.5rem", lg: "3.4rem" },
              lineHeight: 1.08,
              letterSpacing: "-0.045em",
              fontWeight: 750,
              mb: 3,
            }}
          >
            Keep your field of research in view.
          </Typography>
          <Stack spacing={2.25}>
            {benefits.map(({ icon: Icon, label }) => (
              <Stack key={label} direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,0.07)",
                    color: "#67f4d0",
                  }}
                >
                  <Icon fontSize="small" />
                </Box>
                <Typography sx={{ color: "rgba(255,255,255,0.78)", fontSize: "1rem" }}>
                  {label}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.46)" }}>
          Evidence first. Noise reduced.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", bgcolor: "background.default", py: { xs: 3, sm: 5 } }}>
        <Container maxWidth="sm" sx={{ px: { xs: 2.5, sm: 4 } }}>
          <Box sx={{ display: { md: "none" }, mb: 5 }}>
            <Brand />
          </Box>
          {children}
        </Container>
      </Box>
    </Box>
  );
}

