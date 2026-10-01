import { useId, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import {
  Alert, Box, Button, ButtonBase, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Link, Stack, Typography,
} from "@mui/material";
import {
  hasSourcesOutsidePeriod, heroSamples, moveSampleIndex, randomSampleIndex,
  sampleDate, sampleExcerpt, sourceBasisLabel, type HeroSample,
} from "../heroSamples";

const focusStyle = {
  "&.Mui-focusVisible": { outline: "3px solid", outlineColor: "primary.dark", outlineOffset: 2 },
};

export function HeroSampleGallery({ samples = heroSamples }: { samples?: readonly HeroSample[] }) {
  const id = useId();
  // Only choose on mount. Auth updates and normal rerenders never rotate the sample.
  const [index, setIndex] = useState(() => randomSampleIndex(samples.length));
  const [open, setOpen] = useState(false);
  const sample = samples[index];
  if (!sample) return null;
  const slideId = (position: number) => `${id}-sample-${position}`;

  return (
    <Box component="section" role="region" aria-roledescription="carousel"
      aria-label="Research digest samples"
      sx={{ minWidth: 0, width: "100%", bgcolor: "#e6eee7", borderRadius: 4, p: { xs: 1.5, sm: 2.5 } }}>
      <Box sx={{ bgcolor: "background.paper", border: "1px solid #d6e2da", borderRadius: 3,
        p: { xs: 2.5, sm: 3 }, boxShadow: "0 16px 40px #1023330d" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Typography variant="overline" color="primary" fontWeight={800}>Actual Radar digest</Typography>
          <Chip label="Sample" size="small" variant="outlined" />
        </Stack>
        {/* Overlapping grid cells reserve the tallest excerpt's height, preventing
            navigation from shifting the hero. Inactive slides are also inert. */}
        <Box sx={{ display: "grid", mt: 2 }}>
          {samples.map((item, position) => (
            <Box key={item.id} id={slideId(position)} role="group" aria-roledescription="slide"
              aria-label={`${position + 1} of ${samples.length}: ${item.title}`}
              aria-hidden={position !== index} inert={position !== index ? true : undefined}
              sx={{ gridArea: "1 / 1", minWidth: 0, overflowWrap: "anywhere",
                visibility: position === index ? "visible" : "hidden" }}>
              <Typography component="h2" variant="h5" sx={{ fontFamily: "Georgia, serif",
                fontSize: { xs: "1.4rem", sm: "1.65rem" }, lineHeight: 1.25, mb: 1 }}>
                {item.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Generated <time dateTime={item.generatedOn}>{sampleDate(item.generatedOn)}</time>
                {" · "}{item.paperCount} papers
              </Typography>
              <Box sx={{ my: 2.5, p: 2, bgcolor: "#f0f6f2", borderLeft: "3px solid #087d67" }}>
                <Typography component="h3" variant="body2" fontWeight={750} sx={{ mb: 0.75 }}>
                  Briefing excerpt
                </Typography>
                <Typography variant="body2">{sampleExcerpt(item.summary)}</Typography>
              </Box>
              <Typography component="h3" variant="overline" color="primary" fontWeight={800}>
                From the digest
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {item.highlights[1] ?? item.highlights[0]}
              </Typography>
            </Box>
          ))}
        </Box>
        <Button onClick={() => setOpen(true)} sx={{ mt: 2, ...focusStyle }}>
          Read summary and sources
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Historical AI-generated sample, not an independent verification. Consult the original sources.
        </Typography>
      </Box>
      {samples.length > 1 && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={0.5} sx={{ mt: 1 }}>
            <Button aria-label="Previous sample" startIcon={<ArrowBackRoundedIcon />}
              onClick={() => setIndex((current) => moveSampleIndex(current, -1, samples.length))}
              sx={{ minHeight: 44, px: 1, flexShrink: 0, ...focusStyle }}>
              Previous
            </Button>
            <Box role="group" aria-label="Choose a sample"
              sx={{ display: "flex", flex: 1, minWidth: 0, flexWrap: "wrap", justifyContent: "center" }}>
              {samples.map((item, position) => (
                <ButtonBase key={item.id} type="button" disableRipple
                  aria-label={`Show sample ${position + 1} of ${samples.length}: ${item.title}`}
                  aria-controls={slideId(position)} aria-current={position === index ? "true" : undefined}
                  aria-disabled={position === index ? true : undefined}
                  onClick={() => { if (position !== index) setIndex(position); }}
                  sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: "50%", ...focusStyle }}>
                  <Box component="span" aria-hidden="true" sx={{ width: position === index ? 12 : 8,
                    height: position === index ? 12 : 8, borderRadius: "50%", border: "1px solid",
                    borderColor: "primary.dark", bgcolor: position === index ? "primary.dark" : "transparent" }} />
                </ButtonBase>
              ))}
            </Box>
            <Button aria-label="Next sample" endIcon={<ArrowForwardRoundedIcon />}
              onClick={() => setIndex((current) => moveSampleIndex(current, 1, samples.length))}
              sx={{ minHeight: 44, px: 1, flexShrink: 0, ...focusStyle }}>
              Next
            </Button>
          </Stack>
          {/* Keep position announcements for screen readers without a visible counter. */}
          <Typography component="span" role="status" aria-live="polite" aria-atomic="true"
            sx={{ position: "absolute", width: 1, height: 1, p: 0, m: -1,
              overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
            Sample {index + 1} of {samples.length}
          </Typography>
        </>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md"
        aria-labelledby={`${id}-summary-title`}>
        <DialogTitle id={`${id}-summary-title`}>{sample.title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ overflowWrap: "anywhere" }}>
            <Typography variant="body2" color="text.secondary">
              Generated {sampleDate(sample.generatedOn)} · {sample.paperCount} papers.
              {" "}Requested reporting period: {sampleDate(sample.reportingPeriod.from)}–{sampleDate(sample.reportingPeriod.to)}.
            </Typography>
            <Typography variant="body2">Reported source basis: {sourceBasisLabel(sample.sourceBasis)}.</Typography>
            {hasSourcesOutsidePeriod(sample) && <Alert severity="info">
              This historical sample includes sources outside the requested reporting period. Publication dates are listed below.
            </Alert>}
            <Typography component="h3" variant="h6">Executive summary</Typography>
            <Typography>{sample.summary}</Typography>
            <Typography component="h3" variant="h6">Highlights</Typography>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              {sample.highlights.map((highlight, position) => (
                <Typography component="li" key={position} sx={{ mb: 1 }}>{highlight}</Typography>
              ))}
            </Box>
            <Typography component="h3" variant="h6">Limitations and source transparency</Typography>
            <Typography>{sample.transparencyNote}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              {sample.warnings.map((warning, position) => (
                <Typography component="li" key={position} sx={{ mb: 1 }}>{warning}</Typography>
              ))}
            </Box>
            <Typography component="h3" variant="h6">Original sources</Typography>
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              {sample.sources.map((source, position) => (
                <Box component="li" key={position} sx={{ mb: 2 }}>
                  <Link href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}<Box component="span" sx={{ fontSize: "0.8em" }}> (opens in a new tab)</Box>
                  </Link>
                  <Typography variant="body2" color="text.secondary">
                    {sampleDate(source.publishedOn)} · {sourceBasisLabel(source.summaryBasis)}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Original AI-generated summary and highlights, retained as a dated product example. This is not a current literature review or professional advice.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
