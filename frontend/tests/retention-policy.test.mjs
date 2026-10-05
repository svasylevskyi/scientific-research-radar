import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const messages = await readFile(new URL("../src/pages/AdminMessagesPage.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/api/contact.ts", import.meta.url), "utf8");
const legal = await readFile(new URL("../src/pages/LegalPage.tsx", import.meta.url), "utf8");

test("admin contact inbox exposes an explicit retention hold instead of guessing legal cases", () => {
  assert.match(messages, /Retain as legal\/financial case/);
  assert.match(messages, /Automatic 12-month cleanup will not delete this case/);
  assert.match(messages, /complaints, refunds, privacy requests, disputes/);
  assert.match(api, /setRetentionHold/);
  assert.match(api, /retention_hold/);
});

test("privacy fallback documents the approved Radar-controlled retention windows", () => {
  assert.match(legal, /off-site database snapshots for 35 days/);
  assert.match(legal, /closure recovery checkpoints for 65 days/);
  assert.match(legal, /contact messages are deleted 12 months after they are marked reviewed/);
  assert.match(legal, /host operational logs use 30 daily rotations/);
  assert.match(legal, /not automatically deleted by these application rules/);
});
