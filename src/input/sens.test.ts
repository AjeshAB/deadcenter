import { test } from "node:test";
import assert from "node:assert/strict";
import { cm360, radiansPerCount, VERTICAL_FOV } from "./sens";
test("Valorant sensitivity maps counts to a full rotation", () => {
  const sens = 0.35;
  assert.ok(
    Math.abs(radiansPerCount(sens) * (360 / (sens * 0.07)) - Math.PI * 2) <
      1e-10,
  );
  assert.ok(Math.abs(cm360(sens, 800) - 46.65306122449) < 1e-8);
});
test("vertical FOV yields 103 degrees at 16:9", () => {
  assert.ok(
    Math.abs(
      (2 *
        Math.atan((Math.tan((VERTICAL_FOV * Math.PI) / 360) * 16) / 9) *
        180) /
        Math.PI -
        103,
    ) < 1e-10,
  );
});
