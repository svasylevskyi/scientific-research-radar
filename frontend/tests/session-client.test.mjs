import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const retrySource = await readFile(new URL("../src/api/rateLimitRetry.ts", import.meta.url), "utf8");
const retryOutput = ts.transpileModule(retrySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const retryUrl = `data:text/javascript;base64,${Buffer.from(retryOutput).toString("base64")}`;
const source = (await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8"))
  .replace('import.meta.env.VITE_API_URL ?? "/api/v1"', '"/api/v1"')
  .replace('"./rateLimitRetry"', JSON.stringify(retryUrl));
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let moduleId = 0;
async function loadClient(locks) {
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks } });
  globalThis.BroadcastChannel = class { addEventListener() {} postMessage() {} };
  return import(`data:text/javascript;base64,${Buffer.from(output + `\n// module ${moduleId++}`).toString("base64")}`);
}
function response(status, data) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("concurrent expired-access requests share a single refresh", async () => {
  const api = await loadClient();
  api.setAccessToken("old");
  let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.get("X-Radar-Request"), "1");
    if (url.endsWith("/auth/refresh")) { refreshes++; await new Promise((r) => setTimeout(r, 10)); return response(200, { access_token: "new" }); }
    return response(options.headers.get("Authorization") === "Bearer new" ? 200 : 401, { ok: true });
  };
  const results = await Promise.all([api.apiRequest("/users/me"), api.apiRequest("/users/me")]);
  assert.equal(refreshes, 1);
  assert.ok(results.every((r) => r.ok));
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function fakeTime(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  t.mock.method(Math, "random", () => 0);
}
function limited(seconds = "30", scope = "request") {
  return new Response(JSON.stringify({detail: "Too many requests"}), {
    status: 429, headers: {"Retry-After": seconds, "X-Radar-Rate-Limit-Scope": scope},
  });
}
test("refresh rate limiting silently waits without expiring the local session", async (t) => {
  fakeTime(t);
  const api = await loadClient();
  api.setAccessToken("old");
  let expired = 0;
  window.addEventListener(api.AUTH_EXPIRED_EVENT, () => expired++);
  let refreshes = 0;
  globalThis.fetch = async (url, options) => url.endsWith("/auth/refresh")
    ? ++refreshes === 1 ? limited() : response(200, {access_token: "new"})
    : response(options.headers.get("Authorization") === "Bearer new" ? 200 : 401, {ok: true});
  const request = api.apiRequest("/users/me");
  await flush(); t.mock.timers.tick(29999); await flush();
  assert.equal(refreshes, 1);
  t.mock.timers.tick(1); await flush();
  assert.equal((await request).ok, true);
  assert.equal(refreshes, 2);
  assert.equal(expired, 0);
});

test("a shared API cooldown delays other requests and staggers recovery", async (t) => {
  fakeTime(t);
  const api = await loadClient(); const calls = [];
  globalThis.fetch = async url => { calls.push(url); return calls.length === 1 ? limited("2", "global") : response(200, {}); };
  const first = api.apiRequest("/digests"); await flush();
  const second = api.apiRequest("/plans"); await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(2000); await flush();
  assert.equal(calls.length, 2);
  t.mock.timers.tick(150); await flush();
  await Promise.all([first, second]);
  assert.equal(calls.length, 3);
});

test("endpoint cooldowns do not block unrelated reads, and rejected writes retain their payload", async (t) => {
  fakeTime(t);
  const api = await loadClient(); const bodies = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("/users/me")) return response(200, {ok: true});
    bodies.push(options.body);
    return bodies.length === 1 ? limited("1") : response(201, {saved: true});
  };
  const body = {value: "original"};
  const saved = api.apiRequest("/digests", {method: "POST", body}); await flush();
  body.value = "changed";
  assert.equal((await api.apiRequest("/users/me")).ok, true);
  t.mock.timers.tick(1000); await flush();
  assert.equal((await saved).saved, true);
  assert.deepEqual(bodies, ['{"value":"original"}', '{"value":"original"}']);
});

test("missing retry guidance uses backoff and continues after repeated throttles", async (t) => {
  fakeTime(t);
  const api = await loadClient(); let calls = 0;
  globalThis.fetch = async () => response(++calls < 4 ? 429 : 200, {ok: true});
  const request = api.apiRequest("/digests"); await flush();
  for (const delay of [1000, 2000, 4000]) { t.mock.timers.tick(delay); await flush(); }
  assert.equal((await request).ok, true);
  assert.equal(calls, 4);
});

test("cancelling a request or ending a session stops queued retries", async (t) => {
  fakeTime(t);
  for (const endSession of [false, true]) {
    const api = await loadClient(); let calls = 0;
    const controller = new AbortController();
    globalThis.fetch = async () => { calls++; return limited(); };
    const request = api.apiRequest("/digests", {signal: controller.signal});
    const rejected = assert.rejects(request, error => error.name === "AbortError");
    await flush();
    if (endSession) api.setAccessToken(null); else controller.abort();
    await rejected;
    t.mock.timers.tick(60000); await flush();
    assert.equal(calls, 1);
  }
});

test("terminal validation and ambiguous write failures are never retried", async () => {
  const api = await loadClient(); let calls = 0;
  for (const status of [403, 422, 500, 429]) {
    globalThis.fetch = async () => { calls++; return new Response('{"detail":"Action requires correction"}', {
      status, headers: status === 429 ? {"X-Radar-Retryable": "false"} : {},
    }); };
    await assert.rejects(api.apiRequest("/digests", {method: "POST", body: {value: 1}}), error => error.status === status);
  }
  assert.equal(calls, 4);
});

test("retry guidance supports HTTP dates and malformed or zero headers safely", async () => {
  const {retryDelay} = await import(retryUrl);
  const now = Date.UTC(2026, 8, 25, 10);
  assert.equal(retryDelay(new Date(now + 90000).toUTCString(), 0, now), 90000);
  assert.equal(retryDelay("0", 0, now), 1000);
  assert.equal(retryDelay("invalid", 2, now), 4000);
  assert.equal(retryDelay(null, 100, now), 30000);
});

test("an in-flight refresh cannot overwrite a newer login or sign-out", async () => {
  const api = await loadClient();
  const started = deferred(), finish = deferred();
  globalThis.fetch = async () => { started.resolve(); await finish.promise; return response(200, { access_token: "stale" }); };
  const refreshing = api.refreshAccessToken();
  await started.promise;
  api.setAccessToken("new-login");
  finish.resolve();
  await assert.rejects(refreshing, (e) => e.status === 409);
  globalThis.fetch = async (_url, options) => { assert.equal(options.headers.get("Authorization"), "Bearer new-login"); return response(200, {}); };
  await api.apiRequest("/users/me");
});

test("origin-wide lock serializes independent tabs and logout", async () => {
  let tail = Promise.resolve();
  const locks = { request(_name, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } };
  const first = await loadClient(locks), second = await loadClient(locks);
  const events = [];
  globalThis.fetch = async () => { events.push("refresh-start"); await new Promise((r) => setTimeout(r, 10)); events.push("refresh-end"); return response(200, { access_token: "valid" }); };
  await Promise.all([first.refreshAccessToken(), second.refreshAccessToken(), second.withSessionLock(async () => events.push("logout"))]);
  assert.deepEqual(events, ["refresh-start", "refresh-end", "refresh-start", "refresh-end", "logout"]);
});

test("a refresh conflict retries once without expiring the session", async () => {
  const api = await loadClient();
  let calls = 0;
  globalThis.fetch = async () => response(++calls === 1 ? 409 : 200, { access_token: "valid" });
  assert.equal((await api.refreshAccessToken()).access_token, "valid");
  assert.equal(calls, 2);
});
