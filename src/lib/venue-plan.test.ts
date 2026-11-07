import { test } from "node:test";
import assert from "node:assert/strict";
import { evenRooms, findStageRoom, relatedRooms, routeSteps, routeTo, stagePlacement, stageRoomText, type VenuePlan } from "./venue-plan.ts";

const plan: VenuePlan = {
  name: "Test School",
  groundLabels: [],
  floors: [
    { floor: 1, rooms: [
      { label: "Topic", kind: "topic", stage: 1, row: "back", x: 0, w: 20, code: "X A" },
      { label: "Speech", kind: "stage", stage: 1, row: "back", x: 60, w: 10, code: "IX A" },
      { label: "Lift", kind: "lift", row: "back", x: 90, w: 10 },
      { label: "Stair", kind: "stair", row: "front", x: 10, w: 10 },
      { label: "Stair", kind: "stair", row: "front", x: 40, w: 10 },
    ] },
    { floor: 2, rooms: [
      { label: "Rest", kind: "rest", stage: [1, 2], row: "front", x: 0, w: 10, code: "IV D" },
    ] },
    { floor: 3, rooms: [
      { label: "Main", kind: "stage", stage: 10, row: "full", x: 0, w: 40 },
      { label: "Landing", kind: "landing", row: "full", x: 40, w: 30 },
    ] },
  ],
  annexes: [
    { id: "hall", name: "Parish Hall", directions: "right of the church", floors: [
      { floor: 0, rooms: [{ label: "Hall", kind: "stage", stage: 9, row: "back", x: 0, w: 100 }] },
    ] },
  ],
};

test("stagePlacement: floor and room centre", () => {
  assert.deepEqual(stagePlacement(plan, 1), { building: "main", floor: 1, position: 65 });
  assert.deepEqual(stagePlacement(plan, 10), { building: "main", floor: 3, position: 20 });
  assert.deepEqual(stagePlacement(plan, 9), { building: "hall", floor: 0, position: 50 });
  assert.equal(stagePlacement(plan, 5), null);
  assert.equal(stagePlacement(null, 1), null);
  assert.equal(findStageRoom(plan, 1)?.room.code, "IX A");
});

test("relatedRooms and stageRoomText cover topic and shared rest rooms", () => {
  assert.deepEqual(relatedRooms(plan, 1).map((r) => [r.floor, r.room.code]), [[1, "X A"], [2, "IV D"]]);
  assert.equal(stageRoomText(plan, 1), "IX A · Topic room X A · Rest room IV D");
  assert.equal(stageRoomText(plan, 10), null);
  assert.equal(stageRoomText(plan, 9), "Parish Hall");
});

test("routeTo: nearest stair (not the nearer lift), via the corridor, into the room", () => {
  const floor = plan.floors[0];
  const target = findStageRoom(plan, 1)!.room;
  assert.deepEqual(routeTo(floor, target), [[45, 81], [45, 50], [65, 50], [65, 35]]);
});

test("routeTo: full-depth floor goes straight across from the landing to the room's edge", () => {
  const floor = plan.floors[2];
  assert.deepEqual(routeTo(floor, floor.rooms[0]), [[55, 50], [38, 50]]);
});

test("routeSteps: building, floor by stairs or lift, room, then helper rooms", () => {
  const f = (n: number) => `F${n}`;
  assert.deepEqual(routeSteps(plan, 1, f).map((s) => s.text), [
    "Enter Test School by the main entrance",
    "Take the stairs or lift to the F1",
    "Stage 1 is room IX A",
    "Topic room: X A, same floor",
    "Rest room: IV D, F2",
  ]);
  assert.deepEqual(routeSteps(plan, 10, f).map((s) => s.text), ["Enter Test School by the main entrance", "Take the stairs to the F3", "Stage 10 (Main) is on the F3"]);
  assert.deepEqual(routeSteps(plan, 9, f).map((s) => s.kind), ["building", "room"]);
  assert.equal(routeSteps(plan, 9, f)[0].text, "Walk to Parish Hall, right of the church");
  assert.equal(routeSteps(plan, 9, f)[1].text, "Stage 9 (Hall) is inside Parish Hall");
  assert.deepEqual(routeSteps(plan, 99, f), []);
});

test("evenRooms: equal widths per row, stairs and halls keep theirs, order kept", () => {
  const even = evenRooms({ floor: 1, rooms: [
    { label: "A", kind: "closed", row: "back", x: 0, w: 50 },
    { label: "S", kind: "stair", row: "back", x: 50, w: 10 },
    { label: "B", kind: "stage", stage: 1, row: "back", x: 60, w: 40 },
    { label: "Hall", kind: "stage", stage: 9, row: "front", x: 0, w: 100 },
    { label: "Main", kind: "stage", stage: 10, row: "full", x: 0, w: 70 },
  ] });
  assert.deepEqual(even.rooms.map((r) => [r.label, r.x, r.w]), [["A", 0, 45], ["S", 45, 10], ["B", 55, 45], ["Hall", 0, 100], ["Main", 0, 70]]);
});
