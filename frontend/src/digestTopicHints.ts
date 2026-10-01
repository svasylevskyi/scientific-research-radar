import topics from "./data/digest-topic-hints.json";

// Exact `topic` values from /DIGEST_TEST_REQUESTS.md. Presentation hints only:
// never use this list as validation, selectable presets, or submitted values.
export const digestTopicHints: readonly string[] = topics;

export function randomDigestTopicHint(random: () => number = Math.random): string {
  const value = random();
  const index = Number.isFinite(value) && value >= 0 && value < 1
    ? Math.floor(value * digestTopicHints.length) : 0;
  return `e.g. ${digestTopicHints[index] ?? "Your research topic"}`;
}
