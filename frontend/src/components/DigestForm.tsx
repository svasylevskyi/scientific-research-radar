import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
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

import type {
  Digest,
  DigestFrequency,
  DigestInput,
  TargetAudience,
} from "../types/digest";
import { KeywordInput } from "./KeywordInput";

const DESCRIPTION_LIMIT = 300;
const MAXIMUM_PAPERS_LIMIT = 30;
const MAX_KEYWORDS = 20;

const audienceOptions: { value: TargetAudience; label: string }[] = [
  { value: "researchers", label: "Researchers" },
  { value: "builders_technical_teams", label: "Builders / technical teams" },
  { value: "science_communicators_educators", label: "Science communicators / educators" },
  { value: "executives_decision_makers", label: "Executives / decision makers" },
  { value: "general", label: "General audience" },
];

const frequencyOptions: { value: DigestFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export interface DigestFormValues {
  topic: string;
  description: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  targetAudience: TargetAudience[];
  reportingFrom: string;
  reportingTo: string;
  frequency: DigestFrequency;
  maximumPapers: string;
}

type FormErrors = Partial<Record<keyof DigestFormValues, string>>;

interface DigestFormProps {
  initialValues: DigestFormValues;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (input: DigestInput) => Promise<void>;
  onCancel?: () => void;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDefaultDigestFormValues(): DigestFormValues {
  const currentDate = new Date();
  const twoWeeksAgo = new Date(currentDate);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  return {
    topic: "",
    description: "",
    includeKeywords: [],
    excludeKeywords: [],
    targetAudience: ["general"],
    reportingFrom: toDateInputValue(twoWeeksAgo),
    reportingTo: toDateInputValue(currentDate),
    frequency: "weekly",
    maximumPapers: "20",
  };
}

export function digestToFormValues(digest: Digest): DigestFormValues {
  return {
    topic: digest.topic,
    description: digest.description ?? "",
    includeKeywords: digest.include_keywords,
    excludeKeywords: digest.exclude_keywords,
    targetAudience: digest.target_audience,
    reportingFrom: digest.reporting_from,
    reportingTo: digest.reporting_to,
    frequency: digest.frequency,
    maximumPapers: String(digest.maximum_papers),
  };
}

export function DigestForm({
  initialValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: DigestFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [today] = useState(() => toDateInputValue(new Date()));

  function setValue<TKey extends keyof DigestFormValues>(
    field: TKey,
    value: DigestFormValues[TKey],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function changeAudience(event: SelectChangeEvent<TargetAudience[]>) {
    const value = event.target.value;
    setValue(
      "targetAudience",
      (typeof value === "string" ? value.split(",") : value) as TargetAudience[],
    );
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};
    if (!values.topic.trim()) nextErrors.topic = "Digest topic is required.";
    if (values.description.length > DESCRIPTION_LIMIT) {
      nextErrors.description = `Description cannot exceed ${DESCRIPTION_LIMIT} characters.`;
    }
    if (values.includeKeywords.length > MAX_KEYWORDS) {
      nextErrors.includeKeywords = `Use no more than ${MAX_KEYWORDS} include keywords.`;
    }
    if (values.excludeKeywords.length > MAX_KEYWORDS) {
      nextErrors.excludeKeywords = `Use no more than ${MAX_KEYWORDS} exclude keywords.`;
    }
    if (values.targetAudience.length === 0) {
      nextErrors.targetAudience = "Select at least one target audience.";
    }
    if (!values.reportingFrom) nextErrors.reportingFrom = "Start date is required.";
    if (!values.reportingTo) nextErrors.reportingTo = "End date is required.";
    if (values.reportingFrom && values.reportingTo && values.reportingFrom > values.reportingTo) {
      nextErrors.reportingTo = "End date must be on or after the start date.";
    } else if (values.reportingTo > today) {
      nextErrors.reportingTo = "End date cannot be in the future.";
    }

    const maximumPapers = Number(values.maximumPapers);
    if (
      !Number.isInteger(maximumPapers) ||
      maximumPapers < 1 ||
      maximumPapers > MAXIMUM_PAPERS_LIMIT
    ) {
      nextErrors.maximumPapers = `Enter a whole number from 1 to ${MAXIMUM_PAPERS_LIMIT}.`;
    }
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onSubmit({
      topic: values.topic.trim(),
      description: values.description.trim() || null,
      include_keywords: values.includeKeywords,
      exclude_keywords: values.excludeKeywords,
      target_audience: values.targetAudience,
      reporting_from: values.reportingFrom,
      reporting_to: values.reportingTo,
      frequency: values.frequency,
      maximum_papers: Number(values.maximumPapers),
    });
  }

  const audienceLabel = (value: TargetAudience) =>
    audienceOptions.find((option) => option.value === value)?.label ?? value;

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={3} noValidate>
      <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.75 }}>Digest definition</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>
          Give the digest a clear focus and enough context to guide the research.
        </Typography>
        <Stack spacing={2.25}>
          <TextField
            label="Digest topic"
            value={values.topic}
            onChange={(event) => setValue("topic", event.target.value)}
            placeholder="e.g. AI agents for software engineering"
            error={Boolean(errors.topic)}
            helperText={errors.topic}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Box>
            <TextField
              label="Digest description"
              value={values.description}
              onChange={(event) => setValue("description", event.target.value)}
              placeholder="Describe the questions, developments, or evidence this digest should follow."
              multiline
              minRows={4}
              error={Boolean(errors.description)}
              fullWidth
              slotProps={{ htmlInput: { maxLength: DESCRIPTION_LIMIT } }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ mx: 1.75 }}>
              <FormHelperText error>{errors.description}</FormHelperText>
              <FormHelperText>
                {DESCRIPTION_LIMIT - values.description.length} characters remaining
              </FormHelperText>
            </Stack>
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
            value={values.includeKeywords}
            onChange={(keywords) => setValue("includeKeywords", keywords)}
            helperText={errors.includeKeywords ?? "Add terms that should increase a paper's relevance."}
            error={Boolean(errors.includeKeywords)}
          />
          <KeywordInput
            label="Exclude keywords"
            value={values.excludeKeywords}
            onChange={(keywords) => setValue("excludeKeywords", keywords)}
            helperText={errors.excludeKeywords ?? "Add terms that should remove irrelevant papers."}
            error={Boolean(errors.excludeKeywords)}
          />
          <FormControl fullWidth required error={Boolean(errors.targetAudience)}>
            <InputLabel id="target-audience-label">Target audience</InputLabel>
            <Select
              labelId="target-audience-label"
              multiple
              value={values.targetAudience}
              onChange={changeAudience}
              input={<OutlinedInput label="Target audience" />}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={audienceLabel(value)} size="small" />
                  ))}
                </Box>
              )}
            >
              {audienceOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Checkbox checked={values.targetAudience.includes(option.value)} />
                  <ListItemText primary={option.label} />
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {errors.targetAudience ?? "Select one or more reader groups."}
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
              value={values.reportingFrom}
              onChange={(event) => setValue("reportingFrom", event.target.value)}
              error={Boolean(errors.reportingFrom)}
              helperText={errors.reportingFrom ?? " "}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Reporting period to"
              type="date"
              value={values.reportingTo}
              onChange={(event) => setValue("reportingTo", event.target.value)}
              error={Boolean(errors.reportingTo)}
              helperText={errors.reportingTo ?? " "}
              required
              fullWidth
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: today },
              }}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl fullWidth required>
              <InputLabel id="digest-frequency-label">Digest frequency</InputLabel>
              <Select
                labelId="digest-frequency-label"
                value={values.frequency}
                label="Digest frequency"
                onChange={(event) => setValue("frequency", event.target.value as DigestFrequency)}
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
              value={values.maximumPapers}
              onChange={(event) => setValue("maximumPapers", event.target.value)}
              error={Boolean(errors.maximumPapers)}
              helperText={errors.maximumPapers ?? `Maximum ${MAXIMUM_PAPERS_LIMIT} papers.`}
              required
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

      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1.5}
        justifyContent="flex-end"
      >
        {onCancel && (
          <Button color="inherit" size="large" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <SaveRoundedIcon />}
          disabled={isSubmitting}
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
