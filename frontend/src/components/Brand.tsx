import RadarRoundedIcon from "@mui/icons-material/RadarRounded";
import { Box, Typography } from "@mui/material";

interface BrandProps {
  compact?: boolean;
  light?: boolean;
}

export function Brand({ compact = false, light = false }: BrandProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
      <Box
        sx={{
          width: compact ? 36 : 42,
          height: compact ? 36 : 42,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#071a2b",
          bgcolor: "#42e6bd",
        }}
      >
        <RadarRoundedIcon fontSize={compact ? "small" : "medium"} />
      </Box>
      <Box>
        <Typography
          component="div"
          sx={{
            color: light ? "white" : "text.primary",
            fontWeight: 800,
            fontSize: compact ? "0.96rem" : "1.05rem",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          Scientific Research
        </Typography>
        <Typography
          component="div"
          sx={{
            color: light ? "#68efd0" : "primary.main",
            fontWeight: 800,
            fontSize: compact ? "0.79rem" : "0.86rem",
            lineHeight: 1.15,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Radar
        </Typography>
      </Box>
    </Box>
  );
}
