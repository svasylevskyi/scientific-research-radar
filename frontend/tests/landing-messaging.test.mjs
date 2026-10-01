import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Copy regressions only. Rendering, layout, and billing behaviour are unchanged.
const source = await readFile(new URL("../src/pages/LandingPage.tsx", import.meta.url), "utf8");

test("landing page describes published subscriptions, not an unavailable preview", () => {
  assert.doesNotMatch(source, /Product preview|subscription concept|Preview only|not available for purchase yet/i);
  assert.match(source, /Personalized research digests · Built around your topics and your questions/);
  assert.match(source, /Subscriptions are available now\. Find the plan that fits your research needs\./);
});

test("live offer copy sends readers to compare plan-dependent features", () => {
  assert.match(source, /Choose a subscription plan to follow the subjects that matter to you\./);
  assert.match(source, /Compare research allowances, scheduling options, and email delivery\./);
  assert.doesNotMatch(source, /unlimited|free trial|guaranteed|instant results/i);
});

test("the illustrative hero remains explicitly distinguished from an actual digest", () => {
  assert.match(source, /<Chip label="Sample"/);
  assert.match(source, /Illustrative preview, not a generated research result\./);
});

test("both catalogue links retain the Subscription Plans label and destination", () => {
  const links = [...source.matchAll(/<Button\b[^>]*to="\/plans"[^\n]*?Subscription Plans<\/Button>/g)];
  assert.equal(links.length, 2);
});
