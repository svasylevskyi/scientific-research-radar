import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const markdown = await readFile(new URL("../src/components/BasicMarkdown.tsx", import.meta.url), "utf8");
const admin = await readFile(new URL("../src/pages/AdminContentPagesPage.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const about = await readFile(new URL("../src/pages/AboutPage.tsx", import.meta.url), "utf8");
const legal = await readFile(new URL("../src/pages/LegalPage.tsx", import.meta.url), "utf8");

test("public content renderer is constrained and never executes stored HTML", () => {
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML|innerHTML\s*=/);
  assert.match(markdown, /https:/);
  assert.match(markdown, /http:/);
  assert.match(markdown, /mailto:/);
  assert.match(markdown, /href\.startsWith\("\/"\)/);
  assert.match(markdown, /component="blockquote"/);
  assert.match(markdown, /component=\{block\.ordered \? "ol" : "ul"\}/);
});

test("site-content publishing is super-admin only and optimistic", () => {
  assert.match(app, /path="\/admin\/content-pages".*RequireAdmin superAdmin/s);
  assert.match(admin, /expected_revision: draft\.revision/);
  assert.match(admin, /change_note: draft\.changeNote\.trim\(\)/);
  assert.match(admin, /Save & publish/);
  assert.match(admin, /updates the public page immediately/);
});

test("About and legal pages retain deployed fallback copy until an override exists", () => {
  assert.match(about, /loadPublicContent\("about"/);
  assert.match(about, /published \?/);
  assert.match(about, /aboutDefaultContent/);
  assert.match(legal, /loadPublicContent\(kind/);
  assert.match(legal, /published \?/);
  assert.match(legal, /legalDefaultContent/);
});
