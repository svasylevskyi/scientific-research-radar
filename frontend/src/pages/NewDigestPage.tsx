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
const MAXIMUM_PAPERS_LIMIT = 30;

const audienceOptions = [
  { value: "researchers", label: "Researchers" },
  { value: "builders_technical_teams", label: "Builders / technical teams" },
  { value: "science_communicators_educators", label: "Science communicators / educators" },
  { value: "executives_decision_makers", label: "Executives / decision makers" },
  { value: "general", label: "General audience" },
] as const;

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
] as const;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDefaultReportingDates() {
  const currentDate = new Date();
  const twoWeeksAgo = new Date(currentDate);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  return {
    from: toDateInputValue(twoWeeksAgo),
    to: toDateInputValue(currentDate),
  };
}

export function NewDigestPage() {
  const [defaultReportingDates] = useState(getDefaultReportingDates);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [includeKeywords, setIncludeKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string[]>(["general"]);
  const [reportingFrom, setReportingFrom] = useState(defaultReportingDates.from);
  const [reportingTo, setReportingTo] = useState(defaultReportingDates.to);
  const [frequency, setFrequency] = useState("weekly");
  const [maximumPapers, setMaximumPapers] = useState("20");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const dateRangeIsInvalid = Boolean(
    reportingFrom && reportingTo && reportingFrom > reportingTo,
  );
  const reportingToIsInFuture = Boolean(
    reportingTo && reportingTo > defaultReportingDates.to,
  );
  const topicIsInvalid = submitAttempted && !topic.trim();
  const targetAudienceIsInvalid = submitAttempted && targetAudience.length === 0;

  function preventSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
  }

  function changeAudience(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setTargetAudience(typeof value === "string" ? value.split(",") : value);
  }

  function changeMaximumPapers(value: string) {
    if (value === "") {
      setMaximumPapers("");
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    const limitedValue = Math.min(
      MAXIMUM_PAPERS_LIMIT,
      Math.max(1, Math.trunc(parsedValue)),
    );
    setMaximumPapers(String(limitedValue));
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
                error={topicIsInvalid}
                helperText={topicIsInvalid ? "Digest topic is required." : undefined}
                required
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
              <FormControl fullWidth required error={targetAudienceIsInvalid}>
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
                <FormHelperText>
                  {targetAudienceIsInvalid
                    ? "Select at least one target audience."
                    : "Select one or more reader groups."}
                </FormHelperText>
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
                  error={dateRangeIsInvalid || reportingToIsInFuture}
                  helperText={
                    reportingToIsInFuture
                      ? "End date cannot be in the future."
                      : dateRangeIsInvalid
                        ? "End date must be on or after the start date."
                        : " "
                  }
                  fullWidth
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { max: defaultReportingDates.to },
                  }}
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
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Maximum papers"
                  type="number"
                  value={maximumPapers}
                  onChange={(event) => changeMaximumPapers(event.target.value)}
                  helperText={`Maximum ${MAXIMUM_PAPERS_LIMIT} papers.`}
                  fullWidth
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: MAXIMUM_PAPERS_LIMIT,
                      step: 1,
                      inputMode: "numeric",
                    },
                  }}
                />
              </Stack>
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1.5} justifyContent="flex-end">
            <Button component={RouterLink} to="/" color="inherit" size="large">Cancel</Button>
            <Button type="submit" variant="contained" size="large" startIcon={<AutoAwesomeRoundedIcon />}>
              Create digest
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
