import records from "./data/hero-samples.json";

/** Public presentation fields only; never import the private database export. */
export interface HeroSample {
  id: string;
  topic: string;
  title: string;
  generatedOn: string;
  reportingPeriod: { from: string; to: string };
  paperCount: number;
  summary: string;
  highlights: string[];
  sourceBasis: string;
  transparencyNote: string;
  warnings: string[];
  sources: {
    title: string;
    url: string;
    publishedOn: string | null;
    summaryBasis: string;
  }[];
}

export const heroSamples: readonly HeroSample[] = records;

export function randomSampleIndex(count: number, random = Math.random): number {
  if (!Number.isInteger(count) || count <= 0) return 0;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) return 0;
  return Math.floor(value * count);
}

export function moveSampleIndex(index: number, offset: number, count: number): number {
  if (!Number.isInteger(count) || count <= 0) return 0;
  return ((index + offset) % count + count) % count;
}

/** A verbatim first sentence, not a new generated claim or a mid-word cut. */
export function sampleExcerpt(summary: string): string {
  return summary.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? summary;
}

export function sampleDate(value: string | null): string {
  if (!value) return "Date not recorded";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function sourceBasisLabel(basis: string): string {
  const labels: Record<string, string> = {
    mixed: "Mixed source material",
    abstracts_only: "Abstracts only",
    abstract_only: "Abstract only",
    metadata_only: "Metadata only",
    open_full_text: "Open full text",
    extracted_sections: "Extracted sections",
    user_provided_sources: "User-provided sources",
    user_provided_source: "User-provided source",
    unclear: "Source basis unclear",
  };
  return labels[basis] ?? "Source basis not recorded";
}

export function hasSourcesOutsidePeriod(sample: HeroSample): boolean {
  return sample.sources.some(({ publishedOn }) => publishedOn !== null &&
    (publishedOn < sample.reportingPeriod.from || publishedOn > sample.reportingPeriod.to));
}
