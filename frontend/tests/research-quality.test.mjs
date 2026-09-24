import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/components/ResearchQualityNotice.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} });
const module = { exports: {} };
runInNewContext(outputText, { module, exports: module.exports,
  require: (name) => name === "@mui/material" ? new Proxy({}, { get: (_, key) => key }) : require(name) });
const { ResearchQualityNotice } = module.exports;

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === "string") return tree;
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return tree?.props ? text(tree.props.children) + " " + (tree.props.label ?? "") : "";
}
const run = { status: "completed", quality_status: "hold", quality_delivery_blocked: true,
  quality_config: { version: 2, engine_version: "1", config: { mode: "enforce" } },
  quality_findings: [{ code: "reporting_period", severity: "hold", message: "Paper outside the reporting period.", paper_ids: ["paper-a"] }] };

test("held output is labelled unapproved and never presented as a quality pass", () => {
  // The delivery-blocked decision takes precedence over any inconsistent status.
  const tree = ResearchQualityNotice({ run: { ...run, quality_status: "pass" }, admin: false });
  assert.match(text(tree), /not approved for delivery/);
  assert.match(text(tree), /Automatic email is blocked/);
  assert.doesNotMatch(text(tree), /Quality checks passed/);
  assert.equal(elements(tree).find((item) => item.type === "Alert").props.severity, "warning");
  assert.equal(elements(tree).some((item) => item.type === "Accordion"), false);
});

test("observation findings and admin detail explain the recorded decision", () => {
  const tree = ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_config: { ...run.quality_config, config: { mode: "observe" } } }, admin: true });
  assert.match(text(tree), /Observation mode allows delivery/);
  assert.match(text(tree), /settings version 2/i);
  assert.match(text(tree), /paper-a/);
  assert.match(text(tree), /not factual accuracy/);
});

test("legacy and off runs stay not evaluated and partial output is not labelled approved", () => {
  const tree = ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_status: "not_evaluated", quality_config: null, quality_findings: [] }, admin: true });
  assert.match(text(tree), /not evaluated/);
  assert.match(text(tree), /Legacy run/);
  assert.doesNotMatch(text(tree), /Quality checks passed/);
  assert.equal(ResearchQualityNotice({ run: { ...run, status: "running" }, admin: false }), null);
});
