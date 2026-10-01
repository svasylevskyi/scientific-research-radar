import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const samples = JSON.parse(await read("../src/data/hero-samples.json"));
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const runtime = { jsx, jsxs: jsx, Fragment: "Fragment" };
const mui = new Proxy({}, { get: (_, name) => name });
async function load(path, dependencies) {
  const source = await read(path);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0, path);
  const module = { exports: {} };
  runInNewContext(output.outputText, {
    module, exports: module.exports,
    require: (name) => {
      if (name === "react/jsx-runtime") return runtime;
      if (name === "@mui/material") return mui;
      if (name.startsWith("@mui/icons-material/")) return { default: name, __esModule: true };
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}
const helpers = await load("../src/heroSamples.ts", { "./data/hero-samples.json": samples });
const { randomSampleIndex, moveSampleIndex, sampleExcerpt, sampleDate, hasSourcesOutsidePeriod } = helpers;
function walk(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
function text(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node !== "object") return String(node);
  return text(node.props?.children);
}
let instance = 0;
async function gallery(input = samples, random = () => 0) {
  const values = [];
  let cursor = 0;
  let randomCalls = 0;
  const id = `gallery-${instance++}`;
  const { HeroSampleGallery } = await load("../src/components/HeroSampleGallery.tsx", {
    react: {
      useId: () => id,
      useState: (initial) => {
        const slot = cursor++;
        if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
        return [values[slot], (next) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
      },
    },
    "../heroSamples": { ...helpers, randomSampleIndex: (count) => {
      randomCalls++;
      return randomSampleIndex(count, random);
    } },
  });
  return { render: () => { cursor = 0; return HeroSampleGallery({ samples: input }); },
    randomCalls: () => randomCalls };
}
const activeSlides = (tree) => walk(tree).filter((n) => n.props?.["aria-roledescription"] === "slide" && !n.props["aria-hidden"]);
const button = (tree, label) => walk(tree).find((n) => n.type === "Button" && n.props["aria-label"] === label);
const dots = (tree) => walk(tree).filter((n) => n.type === "ButtonBase");

test("all nine approved exports have explicit, public-only fields and distinct presentation IDs", () => {
  assert.equal(samples.length, 9);
  assert.equal(new Set(samples.map((s) => s.id)).size, 9);
  const allowed = ["id", "topic", "title", "generatedOn", "reportingPeriod", "paperCount", "summary",
    "highlights", "sourceBasis", "transparencyNote", "warnings", "sources"].sort();
  for (const sample of samples) {
    assert.deepEqual(Object.keys(sample).sort(), allowed);
    assert.match(sample.id, /^sample-\d{2}$/);
    assert.match(sample.generatedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(Object.keys(sample.reportingPeriod).sort(), ["from", "to"]);
    assert.ok(sample.reportingPeriod.from <= sample.reportingPeriod.to);
    assert.equal(sample.paperCount, sample.sources.length);
    assert.ok(sample.summary && sample.transparencyNote && sample.warnings.length && sample.highlights.length >= 2);
    for (const source of sample.sources) {
      assert.deepEqual(Object.keys(source).sort(), ["publishedOn", "summaryBasis", "title", "url"]);
      const url = new URL(source.url);
      assert.equal(url.protocol, "https:");
      assert.equal(url.username + url.password + url.search + url.hash, "");
      assert.ok(["arxiv.org", "www.nature.com", "zenodo.org", "www.sciencedirect.com",
        "www.ndss-symposium.org", "escholarship.org", "pmc.ncbi.nlm.nih.gov",
        "pubmed.ncbi.nlm.nih.gov", "www.mdpi.com", "doi.org"].includes(url.hostname));
    }
  }
  assert.doesNotMatch(JSON.stringify(samples), /source_run_id|owner_id|public_use_approved|model_name|source_environment|quality_status|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
});

test("excerpts are complete first sentences verbatim from each saved executive summary", () => {
  for (const sample of samples) {
    const excerpt = sampleExcerpt(sample.summary);
    assert.ok(sample.summary.startsWith(excerpt));
    assert.match(excerpt, /[.!?]$/);
    assert.ok(excerpt.length > 100 && excerpt.length < 450);
  }
  assert.equal(sampleExcerpt("Only one sentence."), "Only one sentence.");
  assert.equal(sampleExcerpt(""), "");
});

test("random selection can reach every sample and handles empty/invalid input safely", () => {
  for (let i = 0; i < samples.length; i++) {
    assert.equal(randomSampleIndex(samples.length, () => (i + 0.5) / samples.length), i);
  }
  assert.equal(randomSampleIndex(0, () => { throw Error("must not run"); }), 0);
  for (const value of [-1, 1, NaN, Infinity]) assert.equal(randomSampleIndex(9, () => value), 0);
  assert.equal(randomSampleIndex(1, () => 0.9), 0);
});

test("previous and next wrap without skipping endpoints", () => {
  assert.equal(moveSampleIndex(0, -1, 9), 8);
  assert.equal(moveSampleIndex(8, 1, 9), 0);
  assert.equal(moveSampleIndex(4, 1, 9), 5);
  assert.equal(moveSampleIndex(0, 1, 1), 0);
  assert.equal(moveSampleIndex(0, 1, 0), 0);
});

test("dates are explicit UTC dates and historical out-of-period sources are not concealed", () => {
  assert.equal(sampleDate("2026-09-25"), "25 Sept 2026");
  assert.equal(sampleDate(null), "Date not recorded");
  assert.equal(sampleDate("invalid"), "Date not recorded");
  assert.equal(hasSourcesOutsidePeriod(samples[0]), true);
  assert.equal(hasSourcesOutsidePeriod({ ...samples[0], sources: [{ publishedOn: "2026-09-15" }] }), false);
  assert.equal(hasSourcesOutsidePeriod({ ...samples[0], sources: [{ publishedOn: null }] }), false);
});

test("random sample is stable on rerender and only navigation changes it", async () => {
  const view = await gallery(samples, () => 0.45);
  let tree = view.render();
  assert.ok(text(activeSlides(tree)[0]).includes(samples[4].title));
  tree = view.render();
  assert.equal(view.randomCalls(), 1);
  button(tree, "Next sample").props.onClick();
  tree = view.render();
  assert.ok(text(activeSlides(tree)[0]).includes(samples[5].title));
  assert.equal(view.randomCalls(), 1);
  button(tree, "Previous sample").props.onClick();
  assert.ok(text(activeSlides(view.render())[0]).includes(samples[4].title));
});

test("all dots select their exact sample; current dot remains focusable and announced", async () => {
  const view = await gallery();
  let tree = view.render();
  assert.equal(dots(tree).length, samples.length);
  for (let i = 0; i < samples.length; i++) {
    dots(tree)[i].props.onClick();
    tree = view.render();
    const current = dots(tree)[i];
    assert.equal(current.props["aria-current"], "true");
    assert.equal(current.props["aria-disabled"], true);
    assert.equal(current.props.disabled, undefined);
    assert.equal(current.props.type, "button");
    assert.equal(current.props["aria-controls"], activeSlides(tree)[0].props.id);
    assert.ok(text(activeSlides(tree)[0]).includes(samples[i].title));
    assert.equal(dots(tree).filter((n) => n.props["aria-current"]).length, 1);
  }
  button(tree, "Next sample").props.onClick();
  tree = view.render();
  assert.equal(dots(tree)[0].props["aria-current"], "true");
  button(tree, "Previous sample").props.onClick();
  assert.equal(dots(view.render())[8].props["aria-current"], "true");
});

test("inactive slides reserve height but are hidden and inert; controls have visible focus and touch space", async () => {
  const view = await gallery();
  const tree = view.render();
  assert.equal(tree.props["aria-roledescription"], "carousel");
  const slides = walk(tree).filter((n) => n.props?.["aria-roledescription"] === "slide");
  assert.equal(slides.length, 9);
  assert.equal(activeSlides(tree).length, 1);
  for (const [i, slide] of slides.entries()) {
    assert.equal(slide.props.sx.gridArea, "1 / 1");
    assert.equal(slide.props.inert, i === 0 ? undefined : true);
    assert.equal(slide.props.sx.visibility, i === 0 ? "visible" : "hidden");
  }
  for (const dot of dots(tree)) {
    assert.ok(dot.props.sx.width >= 24 && dot.props.sx.height >= 24);
    assert.ok(dot.props.sx["&.Mui-focusVisible"].outline);
  }
  assert.ok(button(tree, "Next sample").props.sx.minHeight >= 44);
  const status = walk(tree).find((n) => n.props?.role === "status");
  assert.equal(status.props["aria-live"], "polite");
  assert.equal(text(status), "Sample 1 of 9");
});

test("summary opens without navigation or API calls and retains source caveats and secure source links", async () => {
  const view = await gallery();
  let tree = view.render();
  const findDialog = (node) => walk(node).find((n) => n.type === "Dialog");
  assert.equal(findDialog(tree).props.open, false);
  walk(tree).find((n) => n.type === "Button" && text(n) === "Read summary and sources").props.onClick();
  tree = view.render();
  const dialog = findDialog(tree);
  assert.equal(dialog.props.open, true);
  assert.ok(text(dialog).includes(samples[0].summary));
  assert.ok(text(dialog).includes(samples[0].transparencyNote));
  assert.ok(text(dialog).includes("outside the requested reporting period"));
  for (const warning of samples[0].warnings) assert.ok(text(dialog).includes(warning));
  for (const link of walk(dialog).filter((n) => n.type === "Link")) {
    assert.equal(link.props.target, "_blank");
    assert.equal(link.props.rel, "noopener noreferrer");
    assert.ok(samples[0].sources.some((s) => s.url === link.props.href));
  }
  dialog.props.onClose();
  assert.equal(findDialog(view.render()).props.open, false);
});

test("gallery handles one/zero samples and keeps instance-specific accessible IDs", async () => {
  assert.equal((await gallery([])).render(), null);
  const single = (await gallery([samples[0]])).render();
  assert.equal(dots(single).length, 0);
  assert.equal(button(single, "Next sample"), undefined);
  const one = (await gallery()).render();
  const two = (await gallery()).render();
  assert.notEqual(activeSlides(one)[0].props.id, activeSlides(two)[0].props.id);
});

test("hero has no timed rotation, network fetch, topic filter or raw HTML rendering", async () => {
  const source = await read("../src/components/HeroSampleGallery.tsx");
  assert.doesNotMatch(source, /setInterval|setTimeout|fetch\(|apiRequest|dangerouslySetInnerHTML|localStorage|sessionStorage|<Select\b|<Autocomplete\b/);
});

test("hero alone uses wider gutters, closer unequal columns and an uncapped desktop text block", async () => {
  const { LandingPage } = await load("../src/pages/LandingPage.tsx", {
    "react-router-dom": { Link: "Link" },
    "../components/MarketingHeader": { MarketingHeader: "MarketingHeader", RadarLink: "RadarLink" },
    "../components/HeroSampleGallery": { HeroSampleGallery: "HeroSampleGallery" },
  });
  const nodes = walk(LandingPage());
  const section = nodes.find((n) => n.props?.["aria-label"] === "Discover Research Radar");
  assert.equal(section.props.sx.px.xs, 2);
  assert.equal(section.props.sx.px.sm, "clamp(24px, 6vw, 160px)");
  const grid = section.props.children;
  assert.equal(grid.props.sx.gridTemplateColumns.lg, "minmax(0, 0.86fr) minmax(0, 1.14fr)");
  assert.equal(grid.props.sx.gridTemplateColumns.xs, "minmax(0, 1fr)");
  assert.equal(grid.props.sx.maxWidth, 1680);
  const copy = walk(section).find((n) => text(n).startsWith("Turn a growing world of papers") && n.type === "Typography");
  assert.equal(copy.props.sx.maxWidth.lg, "none");
  assert.equal(nodes.filter((n) => n.type === "HeroSampleGallery").length, 1);
});
