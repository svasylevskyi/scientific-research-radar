import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/ContactPage.tsx", import.meta.url), "utf8");

test("contact form presents privacy information without inventing contract or consent acceptance", () => {
  assert.match(page, /to="\/privacy"/);
  assert.match(page, /Privacy Notice/);
  assert.match(page, /for how contact messages are handled/);
  assert.match(page, /target="_blank"/);
  assert.doesNotMatch(page, /Checkbox|I agree to the Terms|legal_agreement|accept.*terms/i);
});
