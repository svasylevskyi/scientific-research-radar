import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/RegisterPage.tsx", import.meta.url), "utf8");
const types = await readFile(new URL("../src/types/auth.ts", import.meta.url), "utf8");

test("registration requires an unticked legal agreement with direct document links", () => {
  assert.match(page, /useState\(false\).*legalAgreement|legalAgreement.*useState\(false\)/s);
  assert.match(page, /I agree to the/);
  assert.match(page, /to="\/terms"/);
  assert.match(page, /Terms of Use/);
  assert.match(page, /to="\/privacy"/);
  assert.match(page, /Privacy Notice/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /required/);
});

test("registration never submits without agreement and sends the affirmative value", () => {
  assert.match(page, /!passwordIsValid \|\| !passwordsMatch \|\| !legalAgreement/);
  assert.match(page, /legal_agreement: legalAgreement/);
  assert.match(page, /disabled=\{isSubmitting[^}]*!legalAgreement\}/s);
  assert.match(types, /legal_agreement: boolean/);
});

test("privacy acknowledgement is not presented as optional marketing consent", () => {
  assert.match(page, /acknowledge that I have read the/);
  assert.doesNotMatch(page, /agree to receive|marketing|newsletter|analytics/i);
});
