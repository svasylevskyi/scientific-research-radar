import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

async function page(name) {
  const source = await readFile(new URL(`../src/pages/${name}.tsx`, import.meta.url), "utf8");
  const file = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const elements = [];
  function visit(node) { if (ts.isJsxElement(node)) elements.push(node); ts.forEachChild(node, visit); }
  visit(file);
  const attr = (node, key) => node.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(file) === key)?.initializer?.getText(file);
  return { source, file, elements, attr };
}
for (const [name, width] of [["NewDigestPage", 960], ["AboutPage", 800], ["ContactPage", 720], ["LegalPage", 800]]) {
  test(`${name} centers only its inner content, not the shared page shell`, async () => {
    const { file, elements, attr } = await page(name);
    const column = elements.find(node => attr(node, "data-page-column") === '"centered"');
    assert.ok(column);
    assert.equal(column.parent.openingElement.tagName.getText(file), "Container");
    assert.equal(attr(column.parent, "component"), '"main"');
    const style = attr(column, "sx");
    assert.match(style, /width: "100%"/); assert.ok(style.includes(`maxWidth: ${width}`));
    assert.match(style, /minWidth: 0, mx: "auto"/);
    assert.doesNotMatch(column.getText(file), /<AppHeader|<MarketingHeader|<SiteFooter/);
  });
}
test("workspace welcome copy fills its available column and keeps the action layout", async () => {
  const { elements, attr, source } = await page("DashboardPage");
  const intro = elements.find(n => n.openingElement.tagName.getText() === "Typography" && n.getText().includes("This is your personal research workspace."));
  assert.match(attr(intro, "sx"), /width: "100%"/); assert.doesNotMatch(attr(intro, "sx"), /maxWidth|noWrap/);
  assert.match(source, /Create research digest/); assert.match(source, /flex: "1 1 28rem", minWidth: 0/);
});
test("page copy has no artificial fixed paragraph-width caps outside the deliberate landing design", async () => {
  for (const filename of await readdir(new URL("../src/pages/", import.meta.url))) {
    if (!filename.endsWith(".tsx") || filename === "LandingPage.tsx") continue;
    const { file, elements, attr } = await page(filename.slice(0, -4));
    for (const node of elements.filter(n => n.openingElement.tagName.getText(file) === "Typography")) {
      assert.doesNotMatch(attr(node, "sx") ?? "", /maxWidth\s*:\s*(?:[0-9]|"\d+(?:px|ch|rem))/i, filename);
    }
  }
});
test("digest explanation is above controls/results and independent of creation or run state", async () => {
  const { file, source, elements, attr } = await page("DigestDetailPage");
  const guide = elements.find(n => attr(n, "aria-label") === '"How this digest works"');
  assert.ok(guide); assert.equal(attr(guide, "component"), '"aside"');
  let parent = guide.parent;
  while (parent && !ts.isConditionalExpression(parent)) parent = parent.parent;
  assert.ok(parent); assert.equal(parent.condition.getText(file), "admin");
  assert.doesNotMatch(guide.getText(file), /hasRuns|hasSuccessfulRun|routeState|onClose|position: "sticky"/);
  assert.ok(guide.end < source.indexOf("<DigestScheduleControl"));
  assert.match(guide.getText(file), /does not start a manual run/);
  assert.match(guide.getText(file), /plan’s allowances/);
  assert.match(guide.getText(file), /optional email delivery, subject to your plan/);
  assert.match(guide.getText(file), /Saving preferences does not cancel an existing schedule/);
});
test("creation forwards failure notices without remounting or clearing entered values", async () => {
  const { source } = await page("NewDigestPage");
  assert.match(source, /submitNotice=\{error \? \{ severity: "error", message: error \} : null\}/);
  assert.match(source, /onEdit=\{\(\) => setError\(null\)\}/);
  assert.doesNotMatch(source, /key=\{(?:error|isSubmitting)|setInitialValues\(null\)/);
});
