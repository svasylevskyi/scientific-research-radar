import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const url = async (path, rewrite = source => source) => {
  const source = rewrite(await readFile(new URL(path, import.meta.url), "utf8"));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
};
globalThis.BroadcastChannel = class { addEventListener() {} };
const retryUrl = await url("../src/api/rateLimitRetry.ts");
const clientUrl = await url("../src/api/client.ts", s => s.replace('import.meta.env.VITE_API_URL ?? "/api/v1"', '"/api/v1"').replace('"./rateLimitRetry"', JSON.stringify(retryUrl)));
const { RateLimitError } = await import(clientUrl);
const queueUrl = await url("../src/refreshQueue.ts");
const resourceUrl = await url("../src/resourceLoading.ts", s => s.replace('"./api/client"', JSON.stringify(clientUrl)).replace('"./refreshQueue"', JSON.stringify(queueUrl)));
const { createResourceLoader } = await import(resourceUrl);
const flush = () => new Promise(resolve => setImmediate(resolve));

test("initial throttling releases loading and offers bounded automatic recovery", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  const states = []; let calls = 0;
  const resource = createResourceLoader(async () => { calls++; throw new RateLimitError(Date.now() + 30000); }, state => states.push(state));
  await resource.refresh();
  assert.equal(states.at(-1).loading, false);
  assert.equal(states.at(-1).retrying, true);
  assert.equal(resource.nextAllowedAt(), 130000);
  await resource.refresh(); assert.equal(calls, 1);
  for (let i = 0; i < 2; i++) { t.mock.timers.tick(30000); await resource.refresh(); }
  assert.equal(states.at(-1).retrying, false);
  assert.equal(resource.nextAllowedAt(), Infinity);
  t.mock.timers.tick(30000); await resource.refresh(); assert.equal(calls, 3);
  await resource.refresh(true); assert.equal(calls, 4);
  assert.equal(states.at(-1).retrying, true);
  resource.stop();
});

test("a deferred refresh preserves content and successful retry clears stale status", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100000 });
  const states = []; let calls = 0;
  const resource = createResourceLoader(async () => {
    if (++calls === 2) throw new RateLimitError(Date.now() + 30000);
    return { version: calls };
  }, state => states.push(state));
  await resource.refresh(); await resource.refresh();
  assert.deepEqual(states.at(-1).data, {version: 1});
  assert.ok(states.at(-1).error);
  t.mock.timers.tick(30000); await resource.refresh();
  assert.deepEqual(states.at(-1).data, {version: 3});
  assert.equal(states.at(-1).error, ""); assert.equal(states.at(-1).retryAt, 0);
  resource.stop();
});

test("leaving a resource aborts requests and prevents late updates", async () => {
  let finish, signal; const states = [];
  const resource = createResourceLoader(async current => {
    signal = current;
    await new Promise(resolve => { finish = resolve; });
    return { id: "previous-page" };
  }, state => states.push(state));
  const pending = resource.refresh(); await flush(); resource.stop();
  assert.equal(signal.aborted, true);
  finish(); await pending; assert.deepEqual(states, []);
});

test("a refresh after mutation waits for a subsequent read without overlapping", async () => {
  let finish, calls = 0, active = 0, max = 0; const states = [];
  const resource = createResourceLoader(async () => {
    calls++; active++; max = Math.max(max, active);
    if (calls === 1) await new Promise(resolve => { finish = resolve; });
    active--; return { version: calls };
  }, state => states.push(state));
  const initial = resource.refresh(); await flush();
  const afterWrite = resource.refresh(true); finish();
  await Promise.all([initial, afterWrite]);
  assert.equal(max, 1); assert.equal(calls, 2); assert.equal(states.at(-1).data.version, 2);
  resource.stop();
});

test("ordinary errors remain actionable and do not become rate-limit cooldowns", async () => {
  const states = [];
  const resource = createResourceLoader(async () => { throw new Error("Permission denied"); }, state => states.push(state));
  await resource.refresh();
  assert.equal(states.at(-1).error, "Permission denied");
  assert.equal(states.at(-1).retryAt, 0); assert.equal(states.at(-1).loading, false);
  resource.stop();
});

test("failed atomic loads cancel their remaining sibling requests", async () => {
  let signal;
  const resource = createResourceLoader(async current => {
    signal = current;
    throw new RateLimitError(Date.now() + 30000);
  }, () => {});
  await resource.refresh();
  assert.equal(signal.aborted, true);
  resource.stop();
});
