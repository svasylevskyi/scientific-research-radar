import { Box, Button, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { MarketingHeader } from "../components/MarketingHeader";

const sections = [
  {
    id: "getting-started",
    title: "Start with a verified account",
    paragraphs: [
      "Register and verify your email to create your account. You start on Free and can continue without a payment card, or choose a paid plan. Paid access begins only after payment is verified, not simply because you selected a plan or opened checkout.",
    ],
  },
  {
    id: "your-digests",
    title: "A digest follows your research interests",
    paragraphs: [
      "A digest is a saved research configuration: your topic, optional description and keywords, audience, reporting period, and maximum number of papers. Each run creates a separate edition. Radar searches for papers, assesses relevance, prepares summaries, and brings findings together into themes and a briefing with source references.",
      "Read the briefing to orient yourself, then open individual summaries and original sources to decide what deserves a closer look. Run history lets you revisit earlier editions. Editing Digest Details changes future runs, not the settings or results recorded for past runs.",
    ],
  },
  {
    id: "recurring-research",
    title: "Research when you need it, or on a schedule",
    paragraphs: [
      "Saving a digest does not start research. Use Run now to generate an edition, or Schedule for recurring runs where your plan includes scheduling. Scheduled briefings can be emailed when that feature is included and enabled. Progress and results appear in Output & History; a planned start is not a guaranteed delivery time.",
      "Saving new preferences does not cancel an existing schedule. Delete the schedule to stop future scheduled runs; work already running is a separate operation.",
    ],
  },
  {
    id: "subscriptions",
    title: "Choose the allowance that fits your routine",
    paragraphs: [
      "Subscription Plans shows current prices, features, and allowances. Paid subscriptions renew automatically on the selected Monthly or Yearly interval unless cancelled. Yearly prices cover a full year, while research allowances reset monthly. Manual runs are part of the total run allowance, not extra runs; saved-digest capacity does not reset monthly.",
      "Stripe handles payment. Review the price, billing interval, and any charge before confirming. Subscription and usage shows your access, remaining allowances, and renewal information. An unfinished purchase offers Resume Checkout on its matching plan and interval; confirming another eligible selection replaces that unfinished checkout.",
    ],
  },
  {
    id: "plan-changes",
    title: "Change plans without an intermediate purchase",
    paragraphs: [
      "Available upgrades can start after a prorated payment or at renewal. Changes to another billing interval, including an upgrade from Monthly to a higher Yearly plan, can be scheduled at renewal. Paid downgrades also take effect at renewal; review the effective date and any reduced allowances in the confirmation.",
      "A requested change appears under Current plan. Use Cancel requested change while available to keep your existing plan and interval, or before choosing a different target. This cancels the change, not your subscription.",
    ],
  },
  {
    id: "ending-use",
    title: "Cancel renewal or close your account",
    paragraphs: [
      "To stop paid renewal, open Subscription and usage, then Billing and invoices, and follow the cancellation flow. Ordinary cancellation keeps verified paid access until its end date, then Free applies. Saved research remains, but Free limits apply and incompatible schedules pause. Simply stopping use or deleting a digest does not cancel your subscription.",
      "Profile → Close account is different: it ends access immediately and starts account-data removal and billing resolution. It cannot be undone and does not automatically issue a refund. Cancellation and closure do not remove any applicable withdrawal or refund rights; contact support about those requests.",
    ],
  },
];

export function AboutPage() {
  return (
    <Box>
      <MarketingHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 4, md: 7 } }}>
        <Box data-page-column="centered" sx={{ width: "100%", maxWidth: 800, minWidth: 0, mx: "auto" }}>
          <Typography component="h1" variant="h3" gutterBottom>About Scientific Research Radar</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>Less time sorting papers. More time understanding what matters.</Typography>
          <Typography sx={{ mb: 4 }}>Radar helps researchers, technical teams, educators, and curious readers turn a topic into a focused reading list and a source-linked briefing. Use it to prioritize reading, prepare a discussion, or keep up with an area without starting your search from scratch each time.</Typography>
          <Stack spacing={3}>
            {sections.map(({ id, title, paragraphs }) => (
              <Box component="section" key={id} aria-labelledby={`about-${id}`}>
                <Typography id={`about-${id}`} component="h2" variant="h6" gutterBottom>{title}</Typography>
                <Stack spacing={1.5}>
                  {paragraphs.map(paragraph => <Typography key={paragraph} color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{paragraph}</Typography>)}
                </Stack>
              </Box>
            ))}
          </Stack>
          <Paper component="section" aria-labelledby="about-limitations" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, my: 4 }}>
            <Typography id="about-limitations" component="h2" variant="h6" gutterBottom>A starting point for understanding</Typography>
            <Typography>AI can miss relevant work or misinterpret findings. A run may find fewer papers than requested, and summaries may rely on abstracts or metadata rather than full text. Check source and summary-basis notes and verify important claims in the original papers. Radar is not an exhaustive literature review or a substitute for qualified professional advice.</Typography>
          </Paper>
          <Stack direction="row" gap={2} flexWrap="wrap">
            <Button component={RouterLink} to="/plans" variant="contained">Subscription Plans</Button>
            <Button component={RouterLink} to="/radar/subscription">Review Subscription</Button>
            <Button component={RouterLink} to="/contact">Contact us</Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            For data handling and service conditions, see the <Link component={RouterLink} to="/privacy">Privacy notice</Link> and <Link component={RouterLink} to="/terms">Terms of use</Link>. Both are currently marked as drafts pending final operator details and review.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
