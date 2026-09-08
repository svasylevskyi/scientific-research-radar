import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/pagePolling.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { startPagePolling } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const flush = () => new Promise((r) => setImmediate(r));
function environment() {
  const window = new EventTarget(), document = new EventTarget(), timers = new Map();
  let id = 0;
  document.visibilityState = "visible";
  window.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  window.clearTimeout = (key) => timers.delete(key);
  return { window, document, timers, tick() { const [key, entry] = timers.entries().next().value; timers.delete(key); entry.callback(); } };
}

test("idle polling discovers a run without requiring an existing active run", async () => {
  const env = environment(), seen = [];
  let activeRun = null;
  const stop = startPagePolling(async () => { seen.push(activeRun); }, 5000, env);
  await flush();
  assert.deepEqual(seen, [null]);
  assert.equal([...env.timers.values()][0].delay, 5000);
  activeRun = { id: "scheduled", digest_id: "another-digest" };
  env.tick();
  await flush();
  assert.deepEqual(seen, [null, activeRun]);
  stop();
});

test("focus and visibility refresh immediately; hidden pages do not keep polling", async () => {
  const env = environment(); let calls = 0;
  const stop = startPagePolling(async () => { calls++; }, 5000, env);
  await flush();
  env.document.visibilityState = "hidden";
  env.document.dispatchEvent(new Event("visibilitychange"));
  env.tick(); await flush();
  assert.equal(calls, 1); assert.equal(env.timers.size, 0);
  env.document.visibilityState = "visible";
  env.document.dispatchEvent(new Event("visibilitychange")); await flush();
  assert.equal(calls, 2);
  env.window.dispatchEvent(new Event("focus")); await flush();
  assert.equal(calls, 3); assert.equal(env.timers.size, 1);
  stop();
});

test("overlapping triggers are suppressed and cleanup stops future polls", async () => {
  const env = environment(); let finish, calls = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const stop = startPagePolling(async () => { calls++; await pending; }, 2500, env);
  env.window.dispatchEvent(new Event("focus"));
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1);
  stop(); finish(); await flush();
  env.window.dispatchEvent(new Event("focus"));
  assert.equal(calls, 1); assert.equal(env.timers.size, 0);
});

test("a transient failure schedules a later recovery attempt", async () => {
  const env = environment(); let calls = 0;
  const stop = startPagePolling(async () => { if (++calls === 1) throw new Error("offline"); }, 5000, env);
  await flush(); env.tick(); await flush();
  assert.equal(calls, 2); stop();
});
