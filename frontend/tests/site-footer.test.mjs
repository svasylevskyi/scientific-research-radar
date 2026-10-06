import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const footer = await readFile(new URL("../src/components/SiteFooter.tsx", import.meta.url), "utf8");

test("footer navigation is a separated link row that wraps on narrow screens", () => {
  for (const label of ["Home", "Subscription Plans", "Your Radar", "About", "Contact", "Privacy", "Terms"]) {
    assert.match(footer, new RegExp(`label: "${label}"`));
  }
  const positions = ["Home", "Subscription Plans", "Your Radar", "About", "Contact", "Privacy", "Terms"]
    .map((label) => footer.indexOf(`label: "${label}"`));
  assert.ok(positions.every((value) => value >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(footer, /flexWrap="wrap"/);
  assert.match(footer, /rowGap=\{1\}/);
  assert.doesNotMatch(footer, /overflowX: "auto"/);
  assert.doesNotMatch(footer, /scrollbarWidth/);
  assert.match(footer, /aria-hidden="true"/);
  assert.match(footer, />\s*•\s*</);
  assert.doesNotMatch(footer, />Explore</);
  assert.doesNotMatch(footer, />About Radar</);
  assert.doesNotMatch(footer, />Legal drafts</);
});

test("authenticated footer keeps workspace-aware Radar and Contact routes", () => {
  assert.match(footer, /user \? \[\{ label: "Your Radar", to: "\/radar" \}\] : \[\]/);
  assert.match(footer, /label: "Contact", to: user \? "\/radar\/contact" : "\/contact"/);
  assert.doesNotMatch(footer, /Your radar/);
});
