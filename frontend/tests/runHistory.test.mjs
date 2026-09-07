import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultRunId, filterRuns, loadRunHistory, runDate } from "../src/runHistory.ts";

const run = (id, status = "completed", started_at = "2026-09-07T12:00:00Z") => ({ id, status, started_at });

test("default skips failed and active runs but does not create a default without a success", () => {
  assert.equal(defaultRunId([run("failed", "failed"), run("latest-success"), run("old")]), "latest-success");
  assert.equal(defaultRunId([run("active", "running"), run("success")]), "success");
  assert.equal(defaultRunId([run("failed", "failed")]), "");
  assert.equal(defaultRunId([]), "");
});

test("successful runs beyond the first 100 remain available", async () => {
  const items = Array.from({ length: 101 }, (_, index) => run(String(index), index === 100 ? "completed" : "failed"));
  const offsets = [];
  const result = await loadRunHistory(async (offset) => {
    offsets.push(offset); return { items: items.slice(offset, offset + 100), total: items.length };
  });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(defaultRunId(result), "100");
});

test("date filters include the whole local calendar day and permit one-sided ranges", () => {
  const local = (day, hour) => new Date(2026, 8, day, hour, 59, 59).toISOString();
  const items = [run("before", "completed", local(6, 23)), run("first", "completed", local(7, 0)), run("last", "failed", local(7, 23)), run("after", "completed", local(8, 0))];
  assert.deepEqual(filterRuns(items, "2026-09-07", "2026-09-07").map(r => r.id), ["first", "last"]);
  assert.equal(filterRuns(items, "2026-09-07", "").length, 3);
  assert.equal(filterRuns(items, "", "2026-09-07").length, 3);
  assert.deepEqual(filterRuns(items, "2026-09-08", "2026-09-07"), []);
  assert.equal(filterRuns(items, "", "").length, 4);
});

test("timestamps without a timezone are interpreted as UTC", () => {
  assert.equal(runDate("2026-09-07T12:00:00").getTime(), runDate("2026-09-07T12:00:00Z").getTime());
});
