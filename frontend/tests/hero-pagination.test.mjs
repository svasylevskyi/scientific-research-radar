import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Structural regressions for the small navigation layout change. Gallery state,
// dot selection, wraparound and announcements are exercised in hero-samples.test.mjs.
const source = await readFile(new URL("../src/components/HeroSampleGallery.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("HeroSampleGallery.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(file);
function attribute(node, name) {
  return node.openingElement.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(file) === name);
}
function value(node, name) {
  return attribute(node, name)?.initializer?.getText(file);
}
const pagination = elements.filter((n) => value(n, "aria-label") === '"Choose a sample"');
const statuses = elements.filter((n) => value(n, "role") === '"status"');

test("pagination appears once, between Previous and Next in the same row", () => {
  assert.equal(pagination.length, 1);
  const row = pagination[0].parent;
  assert.ok(ts.isJsxElement(row));
  assert.equal(row.openingElement.tagName.getText(file), "Stack");
  assert.equal(value(row, "direction"), '"row"');
  const children = row.children.filter(ts.isJsxElement);
  assert.equal(children.length, 3);
  assert.equal(value(children[0], "aria-label"), '"Previous sample"');
  assert.equal(children[1], pagination[0]);
  assert.equal(value(children[2], "aria-label"), '"Next sample"');
});

test("counter remains only as a visually hidden, polite position announcement", () => {
  assert.equal(statuses.length, 1);
  const status = statuses[0];
  assert.equal(value(status, "aria-live"), '"polite"');
  assert.equal(value(status, "aria-atomic"), '"true"');
  assert.equal(attribute(status, "aria-hidden"), undefined);
  assert.equal(attribute(status, "hidden"), undefined);
  const styles = value(status, "sx");
  assert.match(styles, /position: "absolute"/);
  assert.match(styles, /width: 1, height: 1/);
  assert.match(styles, /overflow: "hidden", clip: "rect\(0, 0, 0, 0\)"/);
  assert.doesNotMatch(styles, /display: "none"|visibility: "hidden"/);
  assert.equal((source.match(/Sample \{index \+ 1\} of \{samples\.length\}/g) ?? []).length, 1);
});

test("middle dots wrap without shrinking touch targets or navigation buttons", () => {
  assert.match(value(pagination[0], "sx"), /flex: 1, minWidth: 0, flexWrap: "wrap", justifyContent: "center"/);
  const dot = elements.find((n) => n.openingElement.tagName.getText(file) === "ButtonBase");
  assert.match(value(dot, "sx"), /width: 28, height: 28, flexShrink: 0/);
  for (const label of ['"Previous sample"', '"Next sample"']) {
    const button = elements.find((n) => value(n, "aria-label") === label);
    assert.match(value(button, "sx"), /minHeight: 44, px: 1, flexShrink: 0/);
  }
});

test("updated gallery transpiles without syntax diagnostics", () => {
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }, reportDiagnostics: true });
  assert.deepEqual(result.diagnostics, []);
});
