import { test } from "node:test";
import assert from "node:assert/strict";
import { BURSTS, BURST_LIFE, CIRCUITS, MEDAL_DROP, easeOutBack, medalOffsetY, pathLength, pointAlong, shineProgress, sparkAt, sparksFor } from "./story-video-timeline.ts";

test("easeOutBack starts at 0 and ends at 1", () => {
  assert.ok(Math.abs(easeOutBack(0)) < 1e-9);
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
});

test("medal starts above the frame and lands at 0", () => {
  assert.ok(medalOffsetY(0, 600) <= -600);
  assert.ok(Math.abs(medalOffsetY(MEDAL_DROP.start + MEDAL_DROP.duration, 600)) < 1e-6);
  assert.ok(Math.abs(medalOffsetY(5, 600)) < 1e-6);
});

test("shine is off before first sweep and within 0..1 during one", () => {
  assert.equal(shineProgress(0.5), null);
  const p = shineProgress(1.5);
  assert.ok(p !== null && p >= 0 && p <= 1);
});

test("sparks are deterministic and die after their life", () => {
  assert.deepEqual(sparksFor(0), sparksFor(0));
  const s = sparksFor(1)[0];
  assert.equal(sparkAt(BURSTS[1], s, BURST_LIFE + 0.01), null);
  assert.equal(sparkAt(BURSTS[1], s, 0)?.x, BURSTS[1].x);
});

test("pointAlong walks the polyline and clamps at the end", () => {
  const path = CIRCUITS[2];
  assert.deepEqual(pointAlong(path, 0), path[0]);
  assert.deepEqual(pointAlong(path, pathLength(path) + 50), path[path.length - 1]);
  assert.deepEqual(pointAlong([[0, 0], [10, 0], [10, 10]], 15), [10, 5]);
});
