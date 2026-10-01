import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Isolated component/state/DOM doubles, not a React/MUI browser acceptance test.
// No real research records, database, network, payments, or generation requests.
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, key) => String(key) });
async function load(path, dependencies = {}, globals = {}) {
  const source = await read(path);
  const result = ts.transpileModule(source, { fileName: path, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.deepEqual(result.diagnostics, [], path);
  const module = { exports: {} };
  runInNewContext(result.outputText, { module, exports: module.exports, URL, URLSearchParams, Date,
    ...globals, require: name => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return mui;
      if (name.startsWith("@mui/icons-material/")) return { __esModule: true, default: "Icon" };
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unprovided dependency: ${name}`);
    },
  });
  return module.exports;
}
const history = await load("../src/runHistory.ts");
const navigation = await load("../src/navigationContext.ts");
const helpers = await load("../src/resultPresentation.ts", { "./runHistory": history });
const { resultDate, resultTimestamp, resolvePaperReference, safeSourceUrl, paperElementId, runOverview } = helpers;
const { paperQuery, selectedPaperId } = navigation;
const noop = () => {};
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (typeof tree !== "object") return String(tree);
  return [text(tree.props?.children), text(tree.props?.primary), text(tree.props?.label),
    tree.type === "SourceAttribution" ? JSON.stringify(tree.props.value) : ""].join(" ").replace(/\s+/g, " ").trim();
}
function find(tree, predicate) {
  const found = nodes(tree).find(predicate);
  assert.ok(found, "Expected component is present");
  return found;
}
const title = (tree, label) => find(tree, n => n.type === "Typography" && text(n) === label);
const links = tree => nodes(tree).filter(n => n.type === "Link");
function fixturePaper(number = 1, overrides = {}) {
  return {
    rank: number, relevance_score: 0,
    paper: { id: `p${number}`, external_id: `source:${number}`, title: `Paper ${number}`, authors: ["Example Author"],
      source_name: "Example Source", published_date: "2026-09-12", doi: "Example DOI", abstract: "NOT DISPLAYED ABSTRACT",
      url: `https://example.org/papers/${number}` },
    search_data: { updated_date: "2026-09-13", venue_or_source: "Example venue", pdf_url: `https://example.org/pdf/${number}`,
      access_status: "open", full_text_available: true, license: "Example license", discovery_reason: "Discovery reason text",
      matched_keywords: ["Matched term"], possible_duplicate_of: "Possible duplicate identifier", factual_note: "Factual note text",
      warnings: ["Discovery warning text"], citations: [{title: "Citation title", url: "https://example.org/citation"}] },
    relevance_data: { topic_relevance_score: 7, novelty_signal_score: 6, practical_value_score: 5, confidence_score: 4,
      recommended_status: "summarize", best_digest_placement: "top_paper", rationale: "Rationale text", criteria: ["Criterion text"],
      evidence_used: ["Evidence text"], potential_value_for_audience: "Audience value text", caveats: ["Relevance caveat text"],
      next_step_recommendations: ["Relevance next step text"] },
    summary_data: { paper_type: "methods_paper", summary_basis: "abstract_only", concise_summary: `Concise summary ${number}`,
      why_this_paper_matters: ["Why it matters text"], methods: ["Methods text"], key_findings: ["Key finding text"],
      limitations: ["Limitation text"], implications: ["Implication text"], recommendations: ["Paper recommendation text"],
      suggested_digest_bullet: "Digest-ready bullet text", follow_up_questions: ["Follow-up question text"],
      related_search_terms: ["Related term text"], warnings: ["Summary warning text"], confidence_score: 3,
      source_attribution: { title: "Attribution title", authors: ["Rights holder"], source_url: "https://example.org/source",
        license_url: "https://example.org/license", rights_notice: "Rights notice text", changes: "Attribution changes text" } },
    ...overrides,
  };
}
function fixtureRun(overrides = {}) {
  return {
    id: "r1", digest_id: "d1", status: "completed", started_at: "2026-09-20T13:00:00Z", paper_count: 2,
    completed_at: "2026-09-20T13:10:00Z", quality_delivery_blocked: false,
    digest_snapshot: { topic: "Saved topic", reporting_from: "2026-09-01", reporting_to: "2026-09-20" },
    paper_results: [fixturePaper(1), fixturePaper(2)],
    search_data: { queries: ["Search query text"], sources_used: ["Search source text"], coverage_notes: ["Coverage note text"],
      deduplication_notes: ["Deduplication text"], next_step_recommendations: ["Search next step text"] },
    relevance_data: { methodology: "Methodology text", recommendations: ["Overall recommendation text"], quality_warnings: ["Overall warning text"] },
    briefing: { title: "Saved briefing title", executive_summary: "Saved executive summary", content_markdown: "NOT PREVIOUSLY DISPLAYED MARKDOWN",
      data: { highlights: ["Highlight text"], source_basis: "mixed", transparency_note: "Transparency note text",
        quality_warnings: ["Briefing warning text"], top_paper_external_ids: ["source:1"], secondary_paper_external_ids: ["source:2", "unknown:3"],
        main_signal: { title: "Main signal title", summary: "Main signal text", why_it_matters: "Signal significance text",
          supporting_external_ids: ["source:1"], confidence: "medium", caveats: ["Signal caveat text"] },
        recommendations: [{action: "Action text", reason: "Action reason text", priority: "high", related_external_ids: ["source:2"]}],
        recommended_next_searches: [{query: "Next query text", reason: "Next query reason text", priority: "medium"}],
        source_attributions: [fixturePaper().summary_data.source_attribution] } },
    trend_analysis: { overview: "Trend overview text", data: {
      overall_confidence: "medium", analysis_limitations: ["Analysis limitation text"],
      themes: [{title: "Theme title", summary: "Theme summary", evidence_type: "multi_paper_pattern", evidence_external_ids: ["source:1"],
        observed_pattern: "Observed pattern text", interpretation: "Interpretation text", confidence: "high", relevance_to_audience: "Theme audience text", caveats: ["Theme caveat text"]}],
      emerging_items: [{name: "Emerging name", item_type: "method", description: "Emerging description", supporting_external_ids: ["source:2"],
        why_it_matters: "Emerging significance", maturity_level: "early", confidence: "low", caveats: ["Emerging caveat"]}],
      repeated_limitations_or_unresolved_problems: [{name: "Problem name", description: "Problem description", supporting_external_ids: ["source:1"],
        affected_methods_or_topics: ["Problem topic"], why_it_matters: "Problem significance", confidence: "medium"}],
      contradictions_or_competing_approaches: [{description: "Competing description", approach_a: "Approach A text", approach_b: "Approach B text",
        supporting_external_ids: ["source:2"], interpretation: "Competing interpretation", confidence: "low", caveats: ["Competing caveat"]}],
      weak_signals: [{name: "Weak signal name", description: "Weak signal description", supporting_external_ids: ["source:1"],
        why_it_may_matter: "Weak significance", why_confidence_is_limited: "Weak confidence reason", recommended_monitoring_query: "Weak query"}],
      changes_vs_previous_digest: [{change_type: "new_theme", description: "Historical change text", supporting_external_ids: ["unknown:3"],
        previous_digest_reference: "Historical reference text", confidence: "low"}],
      practical_implications: [{audience_segment: "general", implication: "Practical implication text", supporting_external_ids: ["source:1"],
        recommended_action: "Practical action text", confidence: "medium"}],
      recommendations: ["Trend recommendation text"], recommended_next_searches: [{query: "Trend query text", reason: "Trend query reason", priority: "low"}],
    } },
    ...overrides,
  };
}

let rendererNumber = 0;
function renderer() {
  const number = rendererNumber++;
  const instances = new Map(); let current; let effects = []; let dom = new Map();
  const events = [];
  const slot = initial => {
    const index = current.cursor++;
    if (!(index in current.slots)) current.slots[index] = initial();
    return [current.slots, index];
  };
  const react = {
    useState(initial) { const [slots, i] = slot(() => typeof initial === "function" ? initial() : initial);
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const [slots, i] = slot(() => ({ current: initial })); return slots[i]; },
    useId() { const [slots, i] = slot(() => `r${number}-${current.path}-${current.cursor}`); return slots[i]; },
    useCallback: fn => fn,
    useEffect(fn, deps) { const [slots, i] = slot(() => null);
      if (!slots[i] || deps.some((value, pos) => !Object.is(value, slots[i].deps[pos]))) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      } },
  };
  function expand(node, path = "root") {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}-${child?.key ?? index}`));
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") {
      const key = `${path}:${node.type.name}`;
      const instance = instances.get(key) ?? { slots: [], cursor: 0, path };
      instance.cursor = 0; instances.set(key, instance); current = instance;
      return expand(node.type(node.props), key);
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, path + "/children") } };
  }
  return { react, events, document: { getElementById: id => dom.get(id) ?? null },
    render(component, props = {}) {
      effects = [];
      const tree = expand(jsx(component, props));
      dom = new Map(nodes(tree).filter(n => n.props?.id).map(n => [n.props.id, { id: n.props.id,
        focus: options => events.push(["focus", n.props.id, options]),
        scrollIntoView: options => events.push(["scroll", n.props.id, options]),
      }]));
      for (const node of nodes(tree)) if (node.props?.ref && "current" in node.props.ref) {
        const ids = new Set(nodes(node).map(child => child.props?.id).filter(Boolean));
        node.props.ref.current = { contains: target => ids.has(target.id) };
      }
      effects.forEach(fn => fn());
      return tree;
    },
  };
}
async function resultView() {
  const view = renderer();
  const refs = await load("../src/components/PaperReferences.tsx", {
    "react-router-dom": { Link: "RouterLink" }, "../resultPresentation": helpers,
  });
  const overview = await load("../src/components/SelectedRunOverview.tsx", { "../resultPresentation": helpers });
  const results = await load("../src/components/DigestRunResults.tsx", {
    react: view.react, "./PaperReferences": refs, "./SourceAttribution": { SourceAttribution: "SourceAttribution" },
    "../resultPresentation": helpers,
  }, { document: view.document });
  return { ...view, ...results, ...refs, ...overview };
}

test("calendar dates remain calendar dates and missing/invalid dates are explicit", () => {
  const format = new Intl.DateTimeFormat(undefined, {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
  assert.equal(resultDate("2026-09-01"), format.format(new Date("2026-09-01T00:00:00Z")));
  for (const value of [null, undefined, "", "2026-02-30", "2026-09-01T00:00:00Z", {day: 1}]) assert.equal(resultDate(value), "Not recorded");
  assert.equal(resultTimestamp("2026-09-01T23:00:00"), resultTimestamp("2026-09-01T23:00:00Z"));
  assert.equal(resultTimestamp("bad"), "Not recorded");
});

test("overview uses only the selected run snapshot, counts and processing status", () => {
  const run = fixtureRun();
  const result = runOverview(run);
  assert.equal(result.topic, "Saved topic"); assert.equal(result.paperCount, 2); assert.equal(result.summaryCount, 2);
  assert.equal(result.period, `${resultDate("2026-09-01")} – ${resultDate("2026-09-20")}`);
  assert.equal(runOverview({...run, digest_snapshot: {}}).topic, "Topic not recorded");
  assert.equal(runOverview({...run, paper_results: [fixturePaper(1, {summary_data: null})]}).summaryCount, 0);
  assert.match(result.notice, /not independent verification/);
  for (const status of ["queued", "running"]) assert.match(runOverview({...run, status}).notice, /not complete/);
  assert.match(runOverview({...run, status: "failed"}).notice, /partial/);
  assert.match(runOverview({...run, quality_delivery_blocked: true}).notice, /held for review/);
});

test("references require one exact match; missing, ambiguous and near-matching IDs do not resolve", () => {
  const papers = [fixturePaper(1), fixturePaper(2)];
  assert.equal(resolvePaperReference(papers, "source:1"), papers[0]);
  for (const id of ["source:3", "SOURCE:1", "1", " source:1"]) assert.equal(resolvePaperReference(papers, id), null);
  assert.equal(resolvePaperReference([...papers, fixturePaper(1)], "source:1"), null);
});

test("external source links reject unsupported protocols, credentials and malformed URLs", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///tmp/a", "//example.org/a", "https://secret@example.org", "bad", null]) {
    assert.equal(safeSourceUrl(value), null);
  }
  for (const value of ["http://example.org/p", "https://example.org/p?q=one"]) assert.equal(safeSourceUrl(value), value);
  assert.notEqual(paperElementId("r-a", "b"), paperElementId("r", "a-b"));
  assert.ok(!paperElementId('run <"', 'p/#?').includes('"'));
});

test("paper navigation pins the run, preserves list filters, and safely encodes paper IDs", () => {
  const original = new URLSearchParams("output_tab=trends&run_from=2026-09-01&run_failed=1&return_to=%2Fradar%3Fpage%3D4");
  const snapshot = original.toString();
  const next = paperQuery(original, "r1", "paper:/#? &", false);
  assert.equal(original.toString(), snapshot);
  assert.equal(next.get("run_id"), "r1"); assert.equal(next.get("output_tab"), "papers");
  assert.equal(next.get("return_to"), "/radar?page=4"); assert.equal(next.get("run_failed"), "1");
  assert.equal(new URLSearchParams(next.toString()).get("paper_id"), "paper:/#? &");
  assert.equal(selectedPaperId(next, "r1"), "paper:/#? &");
  assert.equal(selectedPaperId(next, "r2"), null);
  assert.equal(selectedPaperId(new URLSearchParams("paper_id=p1"), "r1"), null);
  assert.equal(paperQuery(original, "r1", "p1", true).get("run_section"), "output");
});

test("overview labels older runs without implying scientific verification; admin notices use diagnostics", async () => {
  const view = await resultView();
  const tree = view.render(view.SelectedRunOverview, {run: fixtureRun(), older: true});
  assert.match(text(tree), /Earlier run/); assert.match(text(tree), /Reporting period saved with this run/);
  assert.equal(find(tree, n => n.type === "Chip" && n.props.label === "Completed").props.color, "default");
  const held = view.render(view.SelectedRunOverview, {run: fixtureRun({quality_delivery_blocked: true})});
  assert.match(text(find(held, n => n.type === "Alert")), /held for review/);
  const failed = view.render(view.SelectedRunOverview, {run: fixtureRun({status: "failed"}), admin: true});
  assert.match(text(failed), /Run Diagnostics/); assert.doesNotMatch(text(failed), /Run Steps/);
});

test("supporting titles link internally while original source and PDF links remain distinct", async () => {
  const view = await resultView();
  const tree = view.render(view.PaperReferences, {run: fixtureRun(), ids: ["source:1", "unknown:3"], paperHref: id => `?run_id=r1&paper_id=${id}`});
  const internal = links(tree).filter(n => n.props.to);
  assert.equal(internal.length, 1); assert.equal(internal[0].props.to, "?run_id=r1&paper_id=p1");
  assert.equal(internal[0].props.preventScrollReset, true); assert.equal(text(internal[0]), "Paper 1");
  assert.match(text(tree), /source:1/); assert.match(text(tree), /Unresolved paper reference.*unknown:3/);
  for (const link of links(tree).filter(n => n.props.href)) {
    assert.equal(link.props.target, "_blank"); assert.equal(link.props.rel, "noopener noreferrer");
    assert.match(link.props["aria-label"], /opens in a new tab/);
  }
  const duplicate = view.render(view.PaperReferences, {run: fixtureRun({paper_results: [fixturePaper(1), fixturePaper(1)]}), ids: ["source:1"], paperHref: () => "bad"});
  assert.equal(links(duplicate).length, 0); assert.match(text(duplicate), /No unique match/);
});

test("briefing retains original content and notices, with primary reading before next actions", async () => {
  const view = await resultView(); const run = fixtureRun();
  const before = JSON.stringify(run);
  const tree = view.render(view.DigestBriefingResult, {run, paperHref: id => `?paper_id=${id}`});
  const output = text(tree);
  for (const value of ["Saved executive summary", "Briefing warning text", "Signal caveat text", "Signal significance text", "Highlight text",
    "Action text", "Action reason text", "Next query text", "Next query reason text", "Transparency note text", "Rights notice text"]) assert.ok(output.includes(value), value);
  assert.ok(output.indexOf("Saved executive summary") < output.indexOf("Main signal title"));
  assert.ok(output.indexOf("Main signal title") < output.indexOf("Highlight text"));
  assert.ok(output.indexOf("Briefing warning text") < output.indexOf("Recommended actions"));
  assert.ok(links(tree).some(n => n.props.to === "?paper_id=p2"));
  assert.match(output, /AI confidence: medium/);
  assert.equal(JSON.stringify(run), before);
  assert.match(text(view.render(view.DigestBriefingResult, {run: fixtureRun({briefing: null})})), /No briefing data/);
});

test("trend fields and caveats remain intact and observed patterns are separate from interpretation", async () => {
  const view = await resultView(); const run = fixtureRun(); const before = JSON.stringify(run);
  const tree = view.render(view.TrendAnalysisResult, {run, paperHref: id => `?paper_id=${id}`});
  const output = text(tree);
  for (const value of ["Trend overview text", "Analysis limitation text", "Theme summary", "Observed pattern text", "Interpretation text", "Theme audience text", "Theme caveat text",
    "Emerging description", "Emerging significance", "Emerging caveat", "Problem description", "Problem topic", "Problem significance",
    "Competing description", "Approach A text", "Approach B text", "Competing interpretation", "Competing caveat",
    "Weak signal description", "Weak significance", "Weak confidence reason", "Weak query", "Historical change text", "Historical reference text",
    "Practical implication text", "Practical action text", "Trend recommendation text", "Trend query text", "Trend query reason"]) assert.ok(output.includes(value), value);
  title(tree, "Observed pattern"); title(tree, "Interpretation (AI synthesis)");
  assert.ok(links(tree).some(n => n.props.to === "?paper_id=p1"));
  assert.match(output, /Unresolved paper reference/); assert.equal(JSON.stringify(run), before);
});

test("empty trend sections use compact presentation and do not imply evidence of absence", async () => {
  const view = await resultView(); const run = fixtureRun();
  for (const [key, value] of Object.entries(run.trend_analysis.data)) if (Array.isArray(value)) run.trend_analysis.data[key] = [];
  const tree = view.render(view.TrendAnalysisResult, {run});
  const sections = nodes(tree).filter(n => n.type === "Paper" && n.props.component === "section");
  assert.ok(sections.length >= 10); assert.ok(sections.every(n => n.props.sx.p === 1.5));
  assert.match(text(tree), /Empty sections mean nothing was reported, not that no such evidence exists/);
  assert.match(text(view.render(view.TrendAnalysisResult, {run: fixtureRun({trend_analysis: null})})), /No trend analysis data/);
});

test("paper metadata, concise summary, findings and warnings are visible before collapsed secondary detail", async () => {
  const view = await resultView(); const run = fixtureRun();
  const tree = view.render(view.PaperSummariesResult, {run});
  const article = find(tree, n => n.props.component === "article");
  assert.match(text(article), /Published.*Example Source.*Summary based on: Abstract only.*Source access: Open/);
  assert.match(text(article), /AI relevance 0\/100/);
  const summarySection = nodes(article).find(n => n.type === "Box" && nodes(n).some(child => child.type === "Typography" && text(child) === "Summary"));
  assert.ok(summarySection);
  // Accordion is collapsed by default but its full content is still part of the tree.
  const disclosures = nodes(article).filter(n => n.type === "Accordion");
  assert.equal(disclosures.length, 3); assert.ok(disclosures.every(n => !n.props.defaultExpanded));
  assert.ok(disclosures.every(n => n.props.slotProps.heading.component === "h4"));
  const outside = nodes(article).filter(n => ["Typography", "ListItemText"].includes(n.type) && !disclosures.some(d => nodes(d).includes(n)));
  for (const value of ["Concise summary 1", "Limitation text", "Summary warnings", "Search warnings"]) assert.ok(text(outside).includes(value), value);
  assert.ok(text(article).indexOf("Key finding text") < text(article).indexOf("Methods text"));
  assert.ok(text(tree).indexOf("Paper 1") < text(tree).indexOf("Search coverage and methodology"));
});

test("every previously displayed paper detail, attribution and coverage warning remains accessible", async () => {
  const view = await resultView(); const run = fixtureRun(); const before = JSON.stringify(run);
  const output = text(view.render(view.PaperSummariesResult, {run}));
  for (const value of ["Rights notice text", "Attribution changes text", "Why it matters text", "Methods text", "Key finding text", "Limitation text", "Implication text",
    "Paper recommendation text", "Digest-ready bullet text", "Follow-up question text", "Related term text", "Summary warning text",
    "Rationale text", "Criterion text", "Evidence text", "Audience value text", "Relevance caveat text", "Relevance next step text",
    "Example DOI", "Example license", "Discovery reason text", "Matched term", "Possible duplicate identifier", "Factual note text", "Discovery warning text", "Citation title",
    "Search query text", "Search source text", "Coverage note text", "Deduplication text", "Search next step text", "Methodology text", "Overall recommendation text", "Overall warning text"]) assert.ok(output.includes(value), value);
  assert.equal(JSON.stringify(run), before);
  assert.ok(output.indexOf("Coverage note text") < output.indexOf("Paper 1"));
  assert.ok(output.indexOf("Overall warning text") < output.indexOf("Paper 1"));
});

test("missing summary messages distinguish not selected, failed, completed and in-progress output", async () => {
  const view = await resultView(); const paper = fixturePaper(1, {summary_data: null});
  for (const [status, pattern] of [["failed", /failed before a summary was available/], ["completed", /No summary was saved/], ["running", /has not completed/]]) {
    assert.match(text(view.render(view.PaperSummariesResult, {run: fixtureRun({status, paper_results: [paper]})})), pattern);
  }
  paper.relevance_data.recommended_status = "archive";
  assert.match(text(view.render(view.PaperSummariesResult, {run: fixtureRun({paper_results: [paper]})})), /not selected for summarization/);
  paper.paper.published_date = null;
  assert.match(text(view.render(view.PaperSummariesResult, {run: fixtureRun({paper_results: [paper]})})), /Published: Not recorded/);
});

test("zero-paper messages do not claim there is no literature or hide failed/in-progress processing", async () => {
  const view = await resultView();
  for (const [status, pattern] of [["failed", /failed/], ["running", /not complete/], ["queued", /not complete/], ["completed", /No papers were returned/]]) {
    assert.match(text(view.render(view.PaperSummariesResult, {run: fixtureRun({status, paper_results: [], paper_count: 0})})), pattern);
  }
});

test("disclosures have unique summary/control IDs, without duplicating MUI-generated region IDs", async () => {
  const view = await resultView(); const tree = view.render(view.PaperSummariesResult, {run: fixtureRun()});
  const summaries = nodes(tree).filter(n => n.type === "AccordionSummary");
  assert.ok(summaries.length >= 7);
  assert.equal(new Set(summaries.map(n => n.props.id)).size, summaries.length);
  assert.equal(new Set(summaries.map(n => n.props["aria-controls"])).size, summaries.length);
  assert.ok(nodes(tree).filter(n => n.type === "AccordionDetails").every(n => !n.props.id));
  for (const article of nodes(tree).filter(n => n.props.component === "article")) {
    const heading = find(article, n => n.props.id === article.props["aria-labelledby"]);
    assert.equal(heading.props.tabIndex, -1); assert.equal(heading.props.component, "h3");
  }
});

test("paper-target focus runs on navigation and back/forward, not background data refresh", async () => {
  const view = await resultView(); const run = fixtureRun();
  view.render(view.PaperSummariesResult, {run, targetPaperId: "p2"});
  assert.deepEqual(view.events.map(e => e.slice(0, 2)), [["focus", paperElementId("r1", "p2")], ["scroll", paperElementId("r1", "p2")]]);
  view.render(view.PaperSummariesResult, {run: structuredClone(run), targetPaperId: "p2"});
  assert.equal(view.events.length, 2);
  view.render(view.PaperSummariesResult, {run, targetPaperId: "p1"});
  view.render(view.PaperSummariesResult, {run, targetPaperId: "p2"});
  assert.equal(view.events.length, 6);
  assert.equal(view.events.at(-1)[2].behavior, "auto");
  assert.equal(view.events.at(-2)[2].preventScroll, true);
});

test("target waits for matching paper data and does not focus unknown IDs", async () => {
  const view = await resultView();
  const missing = view.render(view.PaperSummariesResult, {run: fixtureRun({paper_results: []}), targetPaperId: "p2"});
  assert.match(text(missing), /not uniquely available in this run/); assert.equal(view.events.length, 0);
  view.render(view.PaperSummariesResult, {run: fixtureRun(), targetPaperId: "p2"});
  assert.equal(view.events.length, 2);
  view.render(view.PaperSummariesResult, {run: fixtureRun(), targetPaperId: "unknown"});
  assert.equal(view.events.length, 2);
});

async function workspaceView(search = "", admin = false) {
  const view = renderer();
  const state = { search: new URLSearchParams(search), options: null, resource: {data: null, error: "", loading: false} };
  const props = {admin, digestId: "d1", runs: [fixtureRun()], latestRun: fixtureRun(), details: "Editable form", runBlocked: false, onRetry: noop, onUpdate: noop};
  const {DigestWorkspace} = await load("../src/components/DigestWorkspace.tsx", {
    react: view.react, "react-router-dom": {useSearchParams: () => [state.search, (update, options) => {
      state.search = typeof update === "function" ? update(state.search) : update; state.options = options;
    }]}, "../api/client": {ApiError: Error}, "../api/digests": {}, "../auth/AuthContext": {useAuth: () => ({user: {id: "u"}})},
    "../hooks/usePollingResource": {usePollingResource: () => state.resource}, "../runHistory": history, "../navigationContext": navigation,
    ...Object.fromEntries(["ResourceNotice", "RetryRunButton", "DigestRunFeedback", "DigestRunProgress", "AdminRunDiagnostics", "SelectedRunOverview"]
      .map(name => [`./${name}`, {[name]: name}])),
    "./DigestRunResults": {DigestBriefingResult: "DigestBriefingResult", TrendAnalysisResult: "TrendAnalysisResult", PaperSummariesResult: "PaperSummariesResult"},
  }, {document: view.document});
  return {...view, state, props, render: () => view.render(DigestWorkspace, props)};
}

test("workspace source link binds selected history run and preserves tabs/filters through back/forward", async () => {
  const view = await workspaceView("run_id=r1&output_tab=trends&run_from=2026-09-01&return_to=%2Fradar%3Fpage%3D4");
  let tree = view.render(); const before = view.state.search.toString();
  const path = find(tree, n => n.type === "TrendAnalysisResult").props.paperHref("p2");
  const url = new URL(path, "https://radar.example");
  assert.equal(url.pathname, "/radar/digests/d1"); assert.equal(url.searchParams.get("run_id"), "r1");
  assert.equal(url.searchParams.get("return_to"), "/radar?page=4");
  view.state.search = url.searchParams; tree = view.render();
  assert.equal(find(tree, n => n.type === "PaperSummariesResult").props.targetPaperId, "p2");
  view.state.search = new URLSearchParams(before); tree = view.render();
  assert.equal(find(tree, n => n.type === "Tabs").props.value, "trends");
  assert.equal(view.events.at(-1)[1], "output-tab-trends");
  view.state.search = url.searchParams;
  assert.equal(find(view.render(), n => n.type === "PaperSummariesResult").props.targetPaperId, "p2");
  // Explicit tab changes clear the target and preserve the pin and list filters.
  find(view.render(), n => n.type === "Tabs").props.onChange(null, "briefing");
  assert.equal(view.state.search.get("paper_id"), null); assert.equal(view.state.search.get("run_id"), "r1");
  assert.equal(view.state.options.preventScrollReset, true);
});

test("workspace overview and output never show latest-run data under an older selected ID", async () => {
  const view = await workspaceView("run_id=older");
  const older = fixtureRun({id: "older", started_at: "2026-09-18T12:00:00Z", digest_snapshot: {topic: "Old saved topic"}});
  view.props.runs.push(older);
  view.state.resource = {data: null, loading: true, error: ""};
  let tree = view.render();
  assert.equal(nodes(tree).some(n => n.type === "SelectedRunOverview"), false);
  assert.equal(nodes(tree).some(n => n.type === "DigestBriefingResult"), false);
  view.state.resource = {data: older, loading: false, error: ""}; tree = view.render();
  assert.equal(find(tree, n => n.type === "SelectedRunOverview").props.run, older);
  assert.equal(find(tree, n => n.type === "SelectedRunOverview").props.older, true);
  assert.equal(find(tree, n => n.type === "DigestBriefingResult").props.run, older);
  const linked = find(tree, n => n.type === "DigestBriefingResult").props.paperHref("p1");
  assert.equal(new URL(linked, "https://radar.example").searchParams.get("run_id"), "older");
});

test("changing runs clears a targeted paper; stale URL target cannot select a different run's paper", async () => {
  const view = await workspaceView("run_id=r1&output_tab=papers&paper_run_id=r1&paper_id=p1");
  const other = fixtureRun({id: "r2", started_at: "2026-09-19T12:00:00Z"}); view.props.runs.push(other);
  let tree = view.render();
  const oldButton = nodes(tree).find(n => n.type === "Button" && n.props["aria-pressed"] === false);
  assert.ok(oldButton); oldButton.props.onClick();
  assert.equal(view.state.search.get("run_id"), "r2"); assert.equal(view.state.search.has("paper_id"), false);
  view.state.resource.data = other;
  view.state.search = new URLSearchParams("run_id=r2&output_tab=papers&paper_run_id=r1&paper_id=p1"); tree = view.render();
  assert.equal(find(tree, n => n.type === "PaperSummariesResult").props.targetPaperId, null);
});

test("admin source navigation uses the admin run route and keeps diagnostics and read-only behaviour", async () => {
  const view = await workspaceView("run_id=r1&run_section=output&diagnostic_tab=quality&return_to=%2Fadmin%2Fdigests%3Fpage%3D3", true);
  const tree = view.render();
  const path = find(tree, n => n.type === "DigestBriefingResult").props.paperHref("p1");
  const url = new URL(path, "https://radar.example");
  assert.equal(url.pathname, "/admin/digests/d1/runs"); assert.equal(url.searchParams.get("run_section"), "output");
  assert.equal(url.searchParams.get("diagnostic_tab"), "quality"); assert.equal(url.searchParams.get("return_to"), "/admin/digests?page=3");
  assert.equal(nodes(tree).some(n => n.type === "Tab" && n.props.label === "Digest Details"), false);
  find(tree, n => n.type === "Tabs").props.onChange(null, "feedback");
  assert.equal(find(view.render(), n => n.type === "DigestRunFeedback").props.editable, false);
});

test("wide workspace, wrapped metadata and semantic focus targets remain; no new network or HTML injection", async () => {
  const view = await resultView(); const run = fixtureRun(); run.paper_results[0].paper.title = "Long".repeat(150);
  const tree = view.render(view.PaperSummariesResult, {run});
  assert.equal(tree.props.sx.minWidth, 0); assert.equal(tree.props.sx.overflowWrap, "anywhere");
  assert.equal(tree.props.sx["& .MuiChip-label"].whiteSpace, "normal");
  assert.ok(text(tree).includes("Long".repeat(150)));
  for (const path of ["../src/components/DigestRunResults.tsx", "../src/components/PaperReferences.tsx", "../src/components/SelectedRunOverview.tsx"]) {
    assert.doesNotMatch(await read(path), /dangerouslySetInnerHTML|fetch\(|apiRequest|setInterval|\.innerHTML\s*=/);
  }
});
