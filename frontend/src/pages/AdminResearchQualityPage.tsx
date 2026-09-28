import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, Container, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { BenchmarkReviewPanel } from "../components/BenchmarkReviewPanel";
import { ResearchQualitySettings } from "../components/ResearchQualitySettings";
import { qualitySection, sourceRunReturnTo } from "../navigationContext";

export function AdminResearchQualityPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const section = qualitySection(location.hash);
  const [visited, setVisited] = useState(() => ({ settings: section === "settings", benchmarks: section === "benchmarks" }));
  const navigation = useRef<HTMLDivElement>(null);
  const returnTo = sourceRunReturnTo(new URLSearchParams(location.search));

  useEffect(() => {
    setVisited(current => current[section] ? current : { ...current, [section]: true });
    if (!location.hash || location.state?.preserveScroll) return;
    navigation.current?.scrollIntoView({ block: "start" });
    navigation.current?.focus({ preventScroll: true });
  }, [section, location.key, location.hash, location.state]);

  return <Box><AppHeader /><Container component="main" maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
    <Stack ref={navigation} tabIndex={-1} aria-labelledby="research-quality-heading" spacing={3} sx={{ scrollMarginTop: { xs: 16, lg: 12 } }}>
      {returnTo && <Button component={Link} to={returnTo} startIcon={<ArrowBackRoundedIcon />} sx={{ alignSelf: "flex-start" }}>Back to run</Button>}
      <Box><Typography id="research-quality-heading" component="h1" variant="h3">Research quality</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Manage research checks and review shared evaluation benchmarks.</Typography></Box>
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Tabs value={section} onChange={(_, value) => navigate({ search: location.search, hash: `#${value}` },
          { preventScrollReset: true, state: { preserveScroll: true } })} variant="scrollable" scrollButtons="auto" aria-label="Research quality administration">
          <Tab value="settings" label="Settings" id="quality-tab-settings" aria-controls="quality-panel-settings" />
          <Tab value="benchmarks" label="Benchmarks" id="quality-tab-benchmarks" aria-controls="quality-panel-benchmarks" />
        </Tabs>
      </Paper>
      <Box role="tabpanel" id="quality-panel-settings" aria-labelledby="quality-tab-settings" hidden={section !== "settings"}>
        {(visited.settings || section === "settings") && <ResearchQualitySettings />}
      </Box>
      <Box role="tabpanel" id="quality-panel-benchmarks" aria-labelledby="quality-tab-benchmarks" hidden={section !== "benchmarks"}>
        {(visited.benchmarks || section === "benchmarks") && <BenchmarkReviewPanel />}
      </Box>
    </Stack>
  </Container></Box>;
}
