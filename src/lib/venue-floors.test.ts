import { test } from "node:test";
import assert from "node:assert/strict";
import { floorName, floorCount, spreadAlong, groupByFloor, placeOnFloor } from "./venue-floors.ts";

test("floorName", () => {
  assert.equal(floorName(0), "Ground floor");
  assert.equal(floorName(1), "1st floor");
  assert.equal(floorName(2), "2nd floor");
  assert.equal(floorName(3), "3rd floor");
  assert.equal(floorName(4), "4th floor");
  assert.equal(floorName(11), "11th floor");
  assert.equal(floorName(12), "12th floor");
});

test("floorCount always includes ground", () => {
  assert.equal(floorCount([]), 1);
  assert.equal(floorCount([null, 1, 3, 2]), 4);
});

test("spreadAlong centres pins within the range", () => {
  assert.deepEqual(spreadAlong(["a"], 0, 1).map((p) => p.t), [0.5]);
  assert.deepEqual(spreadAlong(["a", "b"], 0, 1).map((p) => p.t), [0.25, 0.75]);
});

test("groupByFloor: top floor first, unplaced last, sorted by number", () => {
  const g = groupByFloor([
    { floor: 1, stageNumber: 3 }, { floor: null, stageNumber: 9 }, { floor: 3, stageNumber: 1 }, { floor: 1, stageNumber: 2 },
  ]);
  assert.deepEqual(g.map((x) => x.floor), [3, 1, null]);
  assert.deepEqual(g[1].stages.map((s) => s.stageNumber), [2, 3]);
});

test("placeOnFloor: positions when all set, else even spread by number", () => {
  const byPos = placeOnFloor([{ stageNumber: 8, mapPosition: 77 }, { stageNumber: 10, mapPosition: 22 }]);
  assert.deepEqual(byPos.map((p) => p.item.stageNumber), [10, 8]);
  assert.ok(Math.abs(byPos[0].t - (0.04 + 0.92 * 0.22)) < 1e-9);
  assert.ok(Math.abs(byPos[0].gap - (byPos[1].t - byPos[0].t)) < 1e-9);
  assert.ok(Math.abs(byPos[1].gap - (1 - byPos[1].t)) < 1e-9);
  assert.ok(Math.abs(byPos[0].gapLeft - byPos[0].t) < 1e-9);
  assert.ok(Math.abs(byPos[1].gapLeft - byPos[0].gap) < 1e-9);
  const mixed = placeOnFloor([{ stageNumber: 2, mapPosition: 90 }, { stageNumber: 1, mapPosition: null }]);
  assert.deepEqual(mixed.map((p) => p.item.stageNumber), [1, 2]);
});
