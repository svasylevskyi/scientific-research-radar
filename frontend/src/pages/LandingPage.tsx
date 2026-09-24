import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
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
        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 11 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" }, gap: { xs: 6, md: 7 }, alignItems: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={800} letterSpacing={2}>A personal lens on scientific research</Typography>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "2.8rem", sm: "3.8rem", md: "4.2rem" }, lineHeight: 1.06, letterSpacing: "-0.055em", mt: 2, mb: 3 }}>
              Follow the science.<br /><Box component="span" sx={{ color: "primary.main" }}>Find your signal.</Box>
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: "1.15rem", maxWidth: 500 }}>
              Turn a growing world of papers into a focused research briefing. Discover what is relevant, understand the findings, and see how the ideas connect.
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ mt: 4 }}>
              <RadarLink />
              <Button component={RouterLink} to="/plans" endIcon={<ArrowForwardRoundedIcon />}>Explore sample plans</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Product preview · Built around your topics and your questions</Typography>
          </Box>
          <Box sx={{ bgcolor: "#e6eee7", borderRadius: 5, p: { xs: 2, sm: 4 }, position: "relative" }}>
            <Box sx={{ bgcolor: "white", border: "1px solid #d6e2da", borderRadius: 3, p: { xs: 2.5, sm: 3.5 }, boxShadow: "0 24px 48px #10233312" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="overline" color="primary" fontWeight={800}>Your research briefing</Typography>
                <Chip label="Sample" size="small" variant="outlined" />
              </Stack>
              <Typography component="h2" variant="h5" sx={{ fontFamily: "Georgia, serif", fontSize: "1.85rem", lineHeight: 1.2, my: 2 }}>A clearer picture of our changing oceans</Typography>
              <Typography variant="body2" color="text.secondary">Ocean observation · Research overview</Typography>
              <Box sx={{ my: 3, p: 2, bgcolor: "#f0f6f2", borderLeft: "3px solid #087d67" }}>
                <Typography fontWeight={750} variant="body2">The question in focus</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>How can satellite observations and autonomous sensors help us understand ocean change?</Typography>
              </Box>
              {[ ["DISCOVER", "Relevant papers, brought together"], ["UNDERSTAND", "Key findings, context, and limitations"], ["CONNECT", "Shared themes and questions to explore"] ].map(([label, title]) => (
                <Box key={label} sx={{ py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Typography sx={{ fontSize: "0.65rem", letterSpacing: 1.5, color: "primary.main", fontWeight: 800 }}>{label}</Typography>
                  <Typography variant="body2" fontWeight={650} sx={{ mt: 0.5 }}>{title}</Typography>
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">Illustrative preview, not a generated research result.</Typography>
            </Box>
          </Box>
        </Container>
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
            <Box><Typography component="h2" variant="h3" sx={{ mb: 2 }}>A research habit, shaped around you.</Typography><Typography sx={{ color: "#c1d8d4" }}>Explore a subscription concept for following the subjects that keep you curious.</Typography></Box>
            <Box><Button component={RouterLink} to="/plans" variant="contained" endIcon={<ArrowForwardRoundedIcon />} sx={{ bgcolor: "#42e6bd", color: "#071a2b", "&:hover": { bgcolor: "#72efd1" } }}>Find your sample plan</Button><Typography variant="caption" sx={{ display: "block", mt: 2, color: "#c1d8d4" }}>Preview only. Subscriptions are not available for purchase yet.</Typography></Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
