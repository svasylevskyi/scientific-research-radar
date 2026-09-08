import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = (await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8"))
  .replace('import.meta.env.VITE_API_URL ?? "/api/v1"', '"/api/v1"');
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

test("refresh rate limiting preserves local session and exposes retry guidance", async () => {
  const api = await loadClient();
  api.setAccessToken("old");
  let expired = 0;
  window.addEventListener(api.AUTH_EXPIRED_EVENT, () => expired++);
  globalThis.fetch = async (url) => url.endsWith("/auth/refresh")
    ? new Response(JSON.stringify({ detail: "Please try again in 30 seconds." }), { status: 429, headers: { "Retry-After": "30" } })
    : response(401, {});
  await assert.rejects(api.apiRequest("/users/me"), (e) => e.status === 429 && e.retryAfterSeconds === 30);
  assert.equal(expired, 0);
  globalThis.fetch = async (_url, options) => { assert.equal(options.headers.get("Authorization"), "Bearer old"); return response(200, {}); };
  await api.apiRequest("/users/me");
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
