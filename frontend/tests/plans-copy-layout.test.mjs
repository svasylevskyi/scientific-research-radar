import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Structural/copy checks only. Checkout and plan-state behaviour remain covered
// by plan-presentation.test.mjs and ui-foundations.test.mjs.
const source = await readFile(new URL("../src/pages/PlansPage.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("PlansPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(file);
const tag = (node) => node.openingElement.tagName.getText(file);
const attribute = (node, name) => node.openingElement.attributes.properties
  .find((item) => ts.isJsxAttribute(item) && item.name.getText(file) === name);
const value = (node, name) => attribute(node, name)?.initializer?.getText(file);
function find(tagName, phrase) {
  const matches = elements.filter((node) => tag(node) === tagName && node.getText(file).includes(phrase));
  assert.equal(matches.length, 1, phrase);
  return matches[0];
}
const intro = find("Typography", "Compare research allowances, scheduling options, and email delivery to find your plan.");
const prompt = find("Typography", "Manual runs are included in the total monthly run allowance");
const details = elements.find((node) => value(node, "component") === '"details"');
assert.ok(details);
const detailsCopy = details.children.find((node) => ts.isJsxElement(node) && tag(node) === "Stack");
assert.ok(detailsCopy);

for (const [name, element] of [["intro", intro], ["below-plan prompt", prompt], ["billing disclosure", detailsCopy]]) {
  test(`${name} uses available width and allows natural responsive wrapping`, () => {
    const styles = value(element, "sx");
    assert.match(styles, /width: "100%"/);
    assert.doesNotMatch(styles, /maxWidth|whiteSpace|textWrap|overflow|height/i);
    assert.equal(attribute(element, "noWrap"), undefined);
    assert.doesNotMatch(element.getText(file), /<br\b/i);
  });
}

test("monthly-reset reminder is in the shared prompt after the plans, not the header", () => {
  const reminder = "Research allowances reset monthly, including on Yearly plans.";
  const tabs = elements.find((node) => tag(node) === "BillingIntervalTabs");
  assert.ok(tabs);
  assert.ok(prompt.pos >= tabs.end && prompt.end <= details.pos);
  assert.ok(prompt.getText(file).includes(reminder));
  assert.equal(source.split(reminder).length - 1, 1);
  assert.ok(!source.slice(0, tabs.pos).includes(reminder));
  assert.match(prompt.getText(file), /Manual runs are included in the total monthly run allowance, not added to it\./);
  assert.match(prompt.getText(file), /Scheduled runs use that same total\. Scheduling frequency does not increase your allowances\./);
});

test("redundant header tax and registration copy are removed without dropping billing terms", () => {
  assert.doesNotMatch(source, /Free is assigned after registration/);
  assert.doesNotMatch(source, /Prices include tax\./);
  assert.match(source, /price.note/);
  assert.match(source, /month"}, tax\s+included/);
  assert.match(detailsCopy.getText(file), /Research allowances reset on your account’s monthly anniversary, including yearly subscriptions\./);
  assert.match(detailsCopy.getText(file), /Unused allowance does not roll over\./);
  assert.match(detailsCopy.getText(file), /Paid subscriptions renew until canceled\./);
  assert.match(detailsCopy.getText(file), /Existing subscriptions keep their purchased revision/);
});

test("page transpiles without syntax diagnostics", () => {
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }, reportDiagnostics: true });
  assert.deepEqual(result.diagnostics, []);
});
