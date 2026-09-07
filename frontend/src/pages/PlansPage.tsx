import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import { MarketingHeader, RadarLink } from "../components/MarketingHeader";

const plans = [
  { name: "Explorer", price: "9", description: "Keep one curiosity in focus.", features: ["1 research digest", "Up to 10 papers per run", "Briefings and paper summaries", "Run history and feedback"] },
  { name: "Researcher", price: "19", description: "Make room for a wider perspective.", features: ["5 research digests", "Up to 20 papers per run", "Briefings and paper summaries", "Run history and feedback"] },
  { name: "Deep Dive", price: "39", description: "Follow several connected fields.", features: ["15 research digests", "Up to 30 papers per run", "Briefings and paper summaries", "Run history and feedback"] },
];

export function PlansPage() {
  return (
    <Box sx={{ bgcolor: "#fbfcf9" }}>
      <MarketingHeader />
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 6, md: 9 } }}>
        <Box sx={{ textAlign: "center", maxWidth: 700, mx: "auto", mb: 6 }}>
          <Chip label="Subscription preview" variant="outlined" color="primary" sx={{ mb: 3 }} />
          <Typography component="h1" variant="h2" sx={{ mb: 2 }}>Feed your curiosity.<br />Choose your depth.</Typography>
          <Typography color="text.secondary">A first look at how Radar subscriptions could work. All prices and allowances below are illustrative, not an offer. No payment will be taken.</Typography>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 3 }}>
          {plans.map((plan, index) => <Box component="section" key={plan.name} sx={{ p: 3.5, borderRadius: 3, bgcolor: "white", border: index === 1 ? "2px solid #087d67" : "2px solid #dce5ea", display: "flex", flexDirection: "column" }}>
            <Typography variant="overline" color="primary" fontWeight={800}>Sample plan {index + 1}</Typography>
            <Typography component="h2" variant="h5" fontWeight={800} sx={{ mt: 1 }}>{plan.name}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>{plan.description}</Typography>
            <Typography sx={{ fontSize: "3rem", fontWeight: 800, letterSpacing: "-0.04em" }}>${plan.price}<Box component="span" sx={{ fontSize: "0.9rem", fontWeight: 400, letterSpacing: 0, color: "text.secondary" }}> USD / month</Box></Typography>
            <Typography variant="caption" color="text.secondary">Illustrative pricing</Typography>
            <Stack component="ul" spacing={2} sx={{ listStyle: "none", p: 0, my: 4, flexGrow: 1 }}>{plan.features.map((feature) => <Stack component="li" key={feature} direction="row" spacing={1.25}><CheckRoundedIcon color="primary" fontSize="small" /><Typography variant="body2">{feature}</Typography></Stack>)}</Stack>
            <Button variant="outlined" disabled fullWidth>Subscriptions coming later</Button>
          </Box>)}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 3 }}>Sample allowances do not change your current account. Billing and subscription limits are not enabled.</Typography>
        <Box sx={{ mt: 7, p: { xs: 3, sm: 5 }, bgcolor: "#eaf2ec", borderRadius: 3, textAlign: "center" }}>
          <Typography component="h2" variant="h5" fontWeight={750} sx={{ mb: 1 }}>Already exploring with Radar?</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Signed-in users can continue to their research workspace.</Typography>
          <RadarLink />
        </Box>
      </Container>
    </Box>
  );
}
