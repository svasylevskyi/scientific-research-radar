import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { HeroSampleGallery } from "../components/HeroSampleGallery";
import { MarketingHeader, RadarLink } from "../components/MarketingHeader";

const steps = [
  ["01", "Set your research direction", "Choose a topic, define your audience, and tell Radar what to include or leave out."],
  ["02", "Turn papers into perspective", "Run a search to discover relevant papers, read concise summaries, and explore emerging themes."],
  ["03", "Build on what you learn", "Revisit past briefings and share feedback to help focus the next run on what matters to you."],
];

export function LandingPage() {
  return (
    <Box sx={{ bgcolor: "#fbfcf9" }}>
      <MarketingHeader />
      <Box component="main">
        <Box component="section" aria-label="Discover Research Radar"
          sx={{ px: { xs: 2, sm: "clamp(24px, 6vw, 160px)" }, py: { xs: 5, lg: 8 } }}>
          <Box sx={{ display: "grid", maxWidth: 1680, mx: "auto",
            gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 0.86fr) minmax(0, 1.14fr)" },
            gap: { xs: 4, lg: "clamp(32px, 3vw, 48px)" }, alignItems: "center" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="primary" fontWeight={800} letterSpacing={2}>A personal lens on scientific research</Typography>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "clamp(2.5rem, 8vw, 3.75rem)", lg: "clamp(2.85rem, 3.75vw, 5rem)" }, lineHeight: 1.06, letterSpacing: "-0.055em", mt: 2, mb: 3 }}>
              Follow the science.<br /><Box component="span" sx={{ color: "primary.main" }}>Find your signal.</Box>
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: "1.15rem", maxWidth: { xs: "65ch", lg: "none" } }}>
              Turn a growing world of papers into a focused research briefing. Discover what is relevant, understand the findings, and see how the ideas connect.
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ mt: 4 }}>
              <RadarLink />
              <Button component={RouterLink} to="/plans" endIcon={<ArrowForwardRoundedIcon />}>Subscription Plans</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Personalized research digests · Built around your topics and your questions</Typography>
          </Box>
          <HeroSampleGallery />
          </Box>
        </Box>
        <Box sx={{ borderTop: "1px solid", borderBottom: "1px solid", borderColor: "divider", py: 3, bgcolor: "white" }}>
          <Container maxWidth="lg"><Stack direction="row" flexWrap="wrap" useFlexGap gap={{ xs: 2, sm: 4 }} justifyContent="center">
            {["For curious minds", "Researchers", "Technical teams", "Science communicators", "Decision makers"].map((text) => <Typography key={text} variant="body2" color="text.secondary" fontWeight={650}>{text}</Typography>)}
          </Stack></Container>
        </Box>
        <Container component="section" maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Typography variant="overline" color="primary" fontWeight={800}>From curiosity to context</Typography>
          <Typography component="h2" variant="h3" sx={{ mt: 1, mb: 5, maxWidth: 600 }}>Less time sorting papers.<br />More time making sense of them.</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 4 }}>
            {steps.map(([number, title, description]) => <Box key={number} sx={{ borderTop: "2px solid #b8d5c9", pt: 3 }}>
              <Typography sx={{ fontFamily: "Georgia, serif", fontSize: "2.6rem", color: "primary.main", mb: 2 }}>{number}</Typography>
              <Typography component="h3" variant="h6" sx={{ mb: 1.5 }}>{title}</Typography>
              <Typography color="text.secondary">{description}</Typography>
            </Box>)}
          </Box>
        </Container>
        <Container maxWidth="lg" sx={{ pb: { xs: 7, md: 10 } }}>
          <Box component="section" sx={{ bgcolor: "#102f32", color: "white", borderRadius: 4, p: { xs: 4, md: 6 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" }, gap: 4, alignItems: "center" }}>
            <Box><Typography component="h2" variant="h3" sx={{ mb: 2 }}>A research habit, shaped around you.</Typography><Typography sx={{ color: "#c1d8d4" }}>Choose a subscription plan to follow the subjects that matter to you. Compare research allowances, scheduling options, and email delivery.</Typography></Box>
            <Box><Button component={RouterLink} to="/plans" variant="contained" endIcon={<ArrowForwardRoundedIcon />} sx={{ bgcolor: "#42e6bd", color: "#071a2b", "&:hover": { bgcolor: "#72efd1" } }}>Subscription Plans</Button><Typography variant="caption" sx={{ display: "block", mt: 2, color: "#c1d8d4" }}>Subscriptions are available now. Find the plan that fits your research needs.</Typography></Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
