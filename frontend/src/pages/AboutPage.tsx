import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { MarketingHeader } from "../components/MarketingHeader";

const steps = [
  ["Tell Radar what interests you", "Create a digest for a subject you want to follow. Add keywords, choose a date range and audience, and describe what to include or leave out. A digest is your saved set of research preferences."],
  ["Discover and understand papers", "When you run a digest, Radar uses AI-assisted search to find relevant scientific papers. It prepares individual summaries, brings related findings together into themes, and writes an overall briefing with references to the sources."],
  ["Explore the results", "Start with the briefing for a quick overview, then explore themes and paper summaries in more detail. Follow the source links to check the evidence and read the original research. Past runs remain available so you can revisit what you found."],
  ["Keep following your topic", "Update your preferences and share feedback to help focus future runs. Depending on your plan, you can run research on demand, schedule recurring runs, and receive completed briefings by email. Your subscription page shows your included features and remaining allowances."],
];

export function AboutPage() {
  return <Box><MarketingHeader /><Container component="main" maxWidth="md" sx={{ py: { xs: 4, md: 7 } }}>
    <Typography component="h1" variant="h3" gutterBottom>About Scientific Research Radar</Typography>
    <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>A simpler way to follow science that matters to you.</Typography>
    <Typography sx={{ mb: 4 }}>Research keeps growing. Radar helps curious readers, researchers, and teams turn a broad topic into a focused, readable overview, without having to sort through every paper themselves.</Typography>
    <Stack spacing={3}>{steps.map(([title, description], index) => <Box key={title}>
      <Typography component="h2" variant="h6" gutterBottom>{index + 1}. {title}</Typography>
      <Typography color="text.secondary">{description}</Typography>
    </Box>)}</Stack>
    <Paper variant="outlined" sx={{ p: 3, my: 4 }}>
      <Typography component="h2" variant="h6" gutterBottom>A starting point for understanding</Typography>
      <Typography>Radar uses AI, which can miss relevant work or misinterpret findings. Results depend on the available sources and are not an exhaustive review of the literature. Treat summaries as a guide, check important claims against the original papers, and use qualified advice for decisions that need it.</Typography>
    </Paper>
    <Stack direction="row" gap={2} flexWrap="wrap"><Button component={RouterLink} to="/plans" variant="contained">Explore plans</Button><Button component={RouterLink} to="/contact">Contact us</Button></Stack>
  </Container></Box>;
}
