import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  FormControl,
  FormHelperText,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader } from "../components/AppHeader";
import { KeywordInput } from "../components/KeywordInput";

const DESCRIPTION_LIMIT = 300;

const audienceOptions = [
  { value: "researchers", label: "Researchers" },
  { value: "builders_technical_teams", label: "Builders / technical teams" },
  { value: "science_communicators_educators", label: "Science communicators / educators" },
  { value: "executives_decision_makers", label: "Executives / decision makers" },
  { value: "general", label: "General audience" },
] as const;

const frequencyOptions = ["daily", "weekly", "monthly", "quarterly"] as const;

export function NewDigestPage() {
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [includeKeywords, setIncludeKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string[]>([]);
  const [reportingFrom, setReportingFrom] = useState("");
  const [reportingTo, setReportingTo] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [maximumPapers, setMaximumPapers] = useState("20");

  const dateRangeIsInvalid = Boolean(
    reportingFrom && reportingTo && reportingFrom > reportingTo,
  );

  function preventSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function changeAudience(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setTargetAudience(typeof value === "string" ? value.split(",") : value);
  }

  const audienceLabel = (value: string) =>
    audienceOptions.find((option) => option.value === value)?.label ?? value;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
        <Button
          component={RouterLink}
          to="/"
          color="inherit"
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ mb: 2 }}
        >
          Back to workspace
        </Button>

        <Typography component="h1" variant="h3" sx={{ mb: 1 }}>
          Create research digest
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Define what to monitor, who the digest is for, and how often it should run.
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          Design preview: the form is interactive, but nothing will be saved yet.
        </Alert>

        <Stack component="form" onSubmit={preventSubmission} spacing={3} noValidate>
          <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>Digest definition</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>
              Give the digest a clear focus and enough context to guide the research.
            </Typography>
            <Stack spacing={2.25}>
              <TextField
                label="Digest topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. AI agents for software engineering"
                fullWidth
              />
              <Box>
                <TextField
                  label="Digest description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the questions, developments, or evidence this digest should follow."
                  multiline
                  minRows={4}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: DESCRIPTION_LIMIT } }}
                />
                <FormHelperText sx={{ mx: 1.75, textAlign: "right" }}>
                  {DESCRIPTION_LIMIT - description.length} characters remaining
                </FormHelperText>
              </Box>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>Search scope</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>
              Refine what should be included, excluded, and emphasized for the audience.
            </Typography>
            <Stack spacing={2.25}>
              <KeywordInput
                label="Include keywords"
                value={includeKeywords}
                onChange={setIncludeKeywords}
                helperText="Add terms that should increase a paper's relevance."
              />
              <KeywordInput
                label="Exclude keywords"
                value={excludeKeywords}
                onChange={setExcludeKeywords}
                helperText="Add terms that should remove irrelevant papers."
              />
              <FormControl fullWidth>
                <InputLabel id="target-audience-label">Target audience</InputLabel>
                <Select
                  labelId="target-audience-label"
                  multiple
                  value={targetAudience}
                  onChange={changeAudience}
                  input={<OutlinedInput label="Target audience" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {selected.map((value) => <Chip key={value} label={audienceLabel(value)} size="small" />)}
                    </Box>
                  )}
                >
                  {audienceOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Checkbox checked={targetAudience.includes(option.value)} />
                      <ListItemText primary={option.label} />
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>Select one or more reader groups.</FormHelperText>
              </FormControl>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 0.75 }}>Reporting settings</Typography>
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>
              Choose the reporting window, schedule, and size of the digest.
            </Typography>
            <Stack spacing={2.25}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Reporting period from"
                  type="date"
                  value={reportingFrom}
                  onChange={(event) => setReportingFrom(event.target.value)}
                  error={dateRangeIsInvalid}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Reporting period to"
                  type="date"
                  value={reportingTo}
                  onChange={(event) => setReportingTo(event.target.value)}
                  error={dateRangeIsInvalid}
                  helperText={dateRangeIsInvalid ? "End date must be on or after the start date." : " "}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="digest-frequency-label">Digest frequency</InputLabel>
                  <Select
                    labelId="digest-frequency-label"
                    value={frequency}
                    label="Digest frequency"
                    onChange={(event) => setFrequency(event.target.value)}
                  >
                    {frequencyOptions.map((option) => (
                      <MenuItem key={option} value={option} sx={{ textTransform: "capitalize" }}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Maximum papers"
                  type="number"
                  value={maximumPapers}
                  onChange={(event) => setMaximumPapers(event.target.value)}
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: 100, step: 1, inputMode: "numeric" } }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1.5} justifyContent="flex-end">
            <Button component={RouterLink} to="/" color="inherit" size="large">Cancel</Button>
            <Button type="button" variant="contained" size="large" startIcon={<AutoAwesomeRoundedIcon />}>
              Create digest
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
