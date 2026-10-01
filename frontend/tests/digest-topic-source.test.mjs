import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("random-topic dataset matches all root test-request topic fields verbatim", async () => {
  const document = await readFile(new URL("../../DIGEST_TEST_REQUESTS.md", import.meta.url), "utf8");
  const requests = [...document.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
  const topics = JSON.parse(await readFile(new URL("../src/data/digest-topic-hints.json", import.meta.url), "utf8"));
  assert.equal(requests.length, 30);
  assert.deepEqual(topics, requests.map(request => request.topic));
  assert.ok(topics.every(topic => typeof topic === "string" && topic.trim() === topic && topic.length <= 200));
});
