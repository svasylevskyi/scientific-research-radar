import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Alert,
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
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { randomDigestTopicHint } from "../digestTopicHints";

import type {
  Digest,
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



export interface DigestFormValues {
  topic: string;
  description: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  targetAudience: TargetAudience[];
  reportingFrom: string;
  reportingTo: string;
  maximumPapers: string;
}

type FormErrors = Partial<Record<keyof DigestFormValues, string>>;
const fieldLabels: Record<keyof DigestFormValues, string> = {
  topic: "Digest topic", description: "Digest description", includeKeywords: "Include keywords",
  excludeKeywords: "Exclude keywords", targetAudience: "Target audience",
  reportingFrom: "Reporting period from", reportingTo: "Reporting period to", maximumPapers: "Maximum papers",
};

function revealAndFocus(element: HTMLElement | null) {
  element?.scrollIntoView({ block: "center", behavior: "auto" });
  element?.focus({ preventScroll: true });
}

interface DigestFormProps {
  initialValues: DigestFormValues;
  submitLabel: string;
  isSubmitting: boolean;
  paperLimit?: number;
  submitDisabled?: boolean;
  paperHint?: string;
  submitNotice?: { severity: "success" | "error"; message: string } | null;
  onEdit?: () => void;
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
    maximumPapers: String(digest.maximum_papers),
  };
}

export function DigestForm({
  initialValues,
  submitLabel,
  isSubmitting,
  paperLimit = MAXIMUM_PAPERS_LIMIT,
  submitDisabled = false,
  paperHint,
  submitNotice,
  onEdit,
  onSubmit,
  onCancel,
}: DigestFormProps) {
  const id = useId();
  const fieldId = (field: keyof DigestFormValues) => `${id}-${field}`;
  const formRef = useRef<HTMLFormElement>(null);
  const validationRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [values, setValues] = useState(initialValues);
  // A hint is chosen once for this form, not on focus, typing, or access polling.
  const [topicHint] = useState(() => randomDigestTopicHint());
  const [errors, setErrors] = useState<FormErrors>({});
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const visibleNotice = unexpectedError ? { severity: "error" as const, message: unexpectedError } : submitNotice;
  const invalidFields = (Object.keys(fieldLabels) as (keyof DigestFormValues)[]).filter((field) => errors[field]);

  useEffect(() => {
    if (validationAttempt > 0) revealAndFocus(validationRef.current);
  }, [validationAttempt]);
  useEffect(() => {
    // Scalar dependencies avoid refocusing whenever a parent constructs a new notice object.
    if (!isSubmitting && visibleNotice?.severity === "error") revealAndFocus(noticeRef.current);
  }, [isSubmitting, visibleNotice?.severity, visibleNotice?.message]);

  function focusField(field: keyof DigestFormValues) {
    const wrapper = formRef.current?.querySelector(`[data-digest-field="${field}"]`);
    const control = wrapper?.querySelector<HTMLElement>('input, textarea, [role="combobox"]') ?? null;
    revealAndFocus(control);
  }
  const [today] = useState(() => toDateInputValue(new Date()));
  const overPaperLimit = Number(values.maximumPapers) > paperLimit;

  function setValue<TKey extends keyof DigestFormValues>(
    field: TKey,
    value: DigestFormValues[TKey],
  ) {
    onEdit?.();
    setUnexpectedError(null);
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
      maximumPapers > paperLimit
    ) {
      nextErrors.maximumPapers = `Enter a whole number from 1 to ${paperLimit}.`;
    }
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled || isSubmitting || submitting.current) return;
    onEdit?.();
    setUnexpectedError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setValidationAttempt((attempt) => attempt + 1);
      return;
    }

    submitting.current = true;
    try {
      await onSubmit({
        topic: values.topic.trim(),
        description: values.description.trim() || null,
        include_keywords: values.includeKeywords,
        exclude_keywords: values.excludeKeywords,
        target_audience: values.targetAudience,
        reporting_from: values.reportingFrom,
        reporting_to: values.reportingTo,
        maximum_papers: Number(values.maximumPapers),
      });
    } catch {
      // Parents normally supply a sanitized notice. Never discard edits on a rejected save.
      setUnexpectedError("Could not save the digest. Your entries are still here; please try again.");
    } finally {
      submitting.current = false;
    }
  }

  const audienceLabel = (value: TargetAudience) =>
    audienceOptions.find((option) => option.value === value)?.label ?? value;

  return (
    <Stack component="form" ref={formRef} onSubmit={handleSubmit} spacing={3} noValidate aria-busy={isSubmitting}>
      <Typography variant="body2" color="text.secondary">Fields marked * are required. Description and keywords are optional.</Typography>
      {invalidFields.length > 0 && (
        <Alert severity="error" role="alert" ref={validationRef} tabIndex={-1}
          sx={{ scrollMarginTop: 120, "&:focus-visible": { outline: "2px solid", outlineColor: "error.main" } }}>
          <Typography fontWeight={700}>Please check the highlighted fields.</Typography>
          <Box component="ul" sx={{ my: 0.5, pl: 2 }}>
            {invalidFields.map((field) => (
              <Box component="li" key={field}>
                <Button type="button" color="inherit" onClick={() => focusField(field)}
                  sx={{ justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal", minHeight: 44 }}>
                  {fieldLabels[field]}: {errors[field]}
                </Button>
              </Box>
            ))}
          </Box>
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.75 }}>Digest definition</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>
          Give the digest a clear focus and enough context to guide the research.
        </Typography>
        <Stack spacing={2.25}>
          <TextField
            id={fieldId("topic")}
            data-digest-field="topic"
            label="Digest topic"
            value={values.topic}
            onChange={(event) => setValue("topic", event.target.value)}
            placeholder={topicHint}
            error={Boolean(errors.topic)}
            helperText={errors.topic ?? "Enter any scientific topic or research question. The example is only a hint."}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Box>
            <TextField
              id={fieldId("description")}
              data-digest-field="description"
              label="Digest description (optional)"
              value={values.description}
              onChange={(event) => setValue("description", event.target.value)}
              placeholder="Describe the questions, developments, or evidence this digest should follow."
              multiline
              minRows={4}
              error={Boolean(errors.description)}
              fullWidth
              slotProps={{ htmlInput: { maxLength: DESCRIPTION_LIMIT, "aria-describedby": `${fieldId("description")}-help ${fieldId("description")}-count` } }}
            />
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" sx={{ mx: 1.75 }}>
              <FormHelperText id={`${fieldId("description")}-help`} error={Boolean(errors.description)}>
                {errors.description ?? "Optional context: questions, developments, or evidence to focus on."}
              </FormHelperText>
              <FormHelperText id={`${fieldId("description")}-count`}>
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
          <Box data-digest-field="includeKeywords">
            <KeywordInput
              id={fieldId("includeKeywords")}
              label="Include keywords (optional)"
              value={values.includeKeywords}
              onChange={(keywords) => setValue("includeKeywords", keywords)}
              helperText={errors.includeKeywords ?? "Add terms that should increase a paper's relevance."}
              error={Boolean(errors.includeKeywords)}
            />
          </Box>
          <Box data-digest-field="excludeKeywords">
            <KeywordInput
              id={fieldId("excludeKeywords")}
              label="Exclude keywords (optional)"
              value={values.excludeKeywords}
              onChange={(keywords) => setValue("excludeKeywords", keywords)}
              helperText={errors.excludeKeywords ?? "Add terms that should remove irrelevant papers."}
              error={Boolean(errors.excludeKeywords)}
            />
          </Box>
          <FormControl data-digest-field="targetAudience" fullWidth required error={Boolean(errors.targetAudience)}>
            <InputLabel id={`${fieldId("targetAudience")}-label`}>Target audience</InputLabel>
            <Select
              id={fieldId("targetAudience")}
              labelId={`${fieldId("targetAudience")}-label`}
              aria-describedby={`${fieldId("targetAudience")}-help`}
              multiple
              value={values.targetAudience}
              onChange={changeAudience}
              input={<OutlinedInput label="Target audience" />}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={audienceLabel(value)} size="small"
                      sx={{ maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere", py: 0.5 } }} />
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
            <FormHelperText id={`${fieldId("targetAudience")}-help`}>
              {errors.targetAudience ?? "Select one or more reader groups to guide the depth and wording."}
            </FormHelperText>
          </FormControl>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2.25, sm: 3.5 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.75 }}>Reporting settings</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>
          Choose the reporting window and maximum number of papers. Scheduled runs use a rolling reporting window of the same length.
        </Typography>
        <Stack spacing={2.25}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              id={fieldId("reportingFrom")}
              data-digest-field="reportingFrom"
              label="Reporting period from"
              type="date"
              value={values.reportingFrom}
              onChange={(event) => setValue("reportingFrom", event.target.value)}
              error={Boolean(errors.reportingFrom)}
              helperText={errors.reportingFrom ?? "First date to include in this reporting window."}
              required
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              id={fieldId("reportingTo")}
              data-digest-field="reportingTo"
              label="Reporting period to"
              type="date"
              value={values.reportingTo}
              onChange={(event) => setValue("reportingTo", event.target.value)}
              error={Boolean(errors.reportingTo)}
              helperText={errors.reportingTo ?? "Last date to include; today or earlier."}
              required
              fullWidth
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: today },
              }}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              id={fieldId("maximumPapers")}
              data-digest-field="maximumPapers"
              label="Maximum papers"
              type="number"
              value={values.maximumPapers}
              onChange={(event) => setValue("maximumPapers", event.target.value)}
              error={overPaperLimit || Boolean(errors.maximumPapers)}
              helperText={overPaperLimit ? `Your current limit is ${paperLimit} papers per run. Reduce this value before saving.` : errors.maximumPapers ?? paperHint ?? `Up to ${paperLimit} papers per run under your plan. Fewer may be found.`}
              required
              fullWidth
              slotProps={{
                htmlInput: {
                  min: 1,
                  max: paperLimit,
                  step: 1,
                  inputMode: "numeric",
                },
              }}
            />
          </Stack>
        </Stack>
      </Paper>

      {visibleNotice && !isSubmitting && (
        <Alert ref={noticeRef} tabIndex={-1} severity={visibleNotice.severity}
          role={visibleNotice.severity === "success" ? "status" : "alert"} sx={{ scrollMarginTop: 120 }}>
          {visibleNotice.message}
        </Alert>
      )}
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
          disabled={isSubmitting || submitDisabled || overPaperLimit}
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
