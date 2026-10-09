import { test } from "node:test";
import assert from "node:assert/strict";
import { boxDistance } from "./bounds";
import { TrackingSamples } from "./analytics";
test("AABB slab test handles parallel rays, boundary origins, and boxes behind the ray", () => {
  const boxes = new Float32Array([-1, -1, -5, 1, 1, -4]);
  assert.equal(boxDistance(boxes, 0, 0, 0, 0, 0, -1), 4);
  assert.equal(boxDistance(boxes, 1, 0, 0, 0, 0, -1), 4);
  assert.equal(boxDistance(boxes, 2, 0, 0, 0, 0, -1), Infinity);
  assert.equal(boxDistance(boxes, 0, 0, -4.5, 0, 0, -1), 0);
  assert.equal(boxDistance(boxes, 0, 0, -6, 0, 0, -1), Infinity);
});
test("timeline is time-weighted and exactly one bucket per 100 ms at different frame rates", () => {
  for (const hz of [60, 144, 240]) {
    const samples = new TrackingSamples();
    for (let i = 0; i < hz; i++) samples.add(1 / hz, i < hz / 2 ? 2 : 0);
    assert.deepEqual(samples.timeline(), [2, 2, 2, 2, 2, 0, 0, 0, 0, 0]);
  }
});
