import { test } from "node:test";
import assert from "node:assert/strict";
import { calcGrade, calcPositions, GROUP_POSITION_POINTS, NO_GRADE_POINTS } from "./result-calculator.ts";

const positions = (scores: number[], scale = undefined as Parameters<typeof calcPositions>[1]) => {
  const map = calcPositions(scores.map((score, i) => ({ id: `r${i}`, score })), scale);
  return scores.map((_, i) => map.get(`r${i}`));
};

test("grade boundaries are 60 / 50 / 40 percent", () => {
  assert.deepEqual(calcGrade(60, 100), { grade: "A", gradePoints: 5 });
  assert.deepEqual(calcGrade(59.9, 100), { grade: "B", gradePoints: 3 });
  assert.deepEqual(calcGrade(50, 100), { grade: "B", gradePoints: 3 });
  assert.deepEqual(calcGrade(40, 100), { grade: "C", gradePoints: 1 });
  assert.deepEqual(calcGrade(39.9, 100), { grade: null, gradePoints: 0 });
  assert.deepEqual(calcGrade(30, 50), { grade: "A", gradePoints: 5 });
});

test("no max score means no grade; an external scale earns no points", () => {
  assert.deepEqual(calcGrade(90, 0), { grade: null, gradePoints: 0 });
  assert.deepEqual(calcGrade(90, 100, NO_GRADE_POINTS), { grade: "A", gradePoints: 0 });
});

test("dense ranking: ties share a place and no place is skipped", () => {
  assert.deepEqual(
    positions([90, 90, 80, 70, 60]).map((p) => p?.position),
    [1, 1, 2, 3, null],
  );
  assert.deepEqual(
    positions([90, 90, 80]).map((p) => p?.positionPoints),
    [5, 5, 3],
  );
});

test("fewer than 3 entries are graded only, never ranked", () => {
  assert.deepEqual(positions([90, 80]).map((p) => p?.position), [null, null]);
});

test("a zero score never places, but still counts toward the field", () => {
  assert.deepEqual(positions([0, 0, 0]).map((p) => p?.position), [null, null, null]);
  assert.deepEqual(positions([50, 40, 0]).map((p) => p?.position), [1, 2, null]);
});

test("team scale awards 10 / 5 / 3", () => {
  assert.deepEqual(
    positions([30, 20, 10], GROUP_POSITION_POINTS).map((p) => p?.positionPoints),
    [10, 5, 3],
  );
});
