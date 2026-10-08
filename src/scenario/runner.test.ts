import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as THREE from "three";
import { scenarioSchema } from "./schema";
import { ScenarioRunner } from "./runner";
import { defaults } from "../settings/store";
import { mulberry32 } from "../game/rng";
import { Player } from "../game/player";
import { Weapon } from "../game/weapon";
import { classify, type ShotRecord } from "../game/analytics";
import { fixMyErrors } from "./playlists";
const dir = new URL("./builtin/", import.meta.url);
const definitions = readdirSync(dir)
  .filter((n) => n.endsWith(".json"))
  .map((n) =>
    scenarioSchema.parse(JSON.parse(readFileSync(new URL(n, dir), "utf8"))),
  );
function run(id: string, seed = 42) {
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = "YXZ";
  return new ScenarioRunner(
    structuredClone(definitions.find((s) => s.id === "builtin/" + id)!),
    new THREE.Scene(),
    camera,
    { ...defaults },
    seed,
  );
}
function aim(r: ScenarioRunner, index = 0) {
  r.camera.lookAt(r.targets[index].head);
  r.camera.updateMatrixWorld(true);
}
test("all 27 builtins validate; malformed ranges, boxes and combos fail", () => {
  assert.equal(definitions.length, 27);
  assert.equal(new Set(definitions.map((s) => s.id)).size, 27);
  assert.equal(
    scenarioSchema.safeParse({
      id: "builtin/test",
      name: "Test",
      category: "combo",
    }).success,
    false,
  );
  assert.equal(
    scenarioSchema.safeParse({
      id: "builtin/test",
      name: "Test",
      category: "wall",
      targets: { distance: [10, 1] },
    }).success,
    false,
  );
  assert.equal(
    scenarioSchema.safeParse({
      id: "builtin/test",
      name: "Test",
      category: "wall",
      map: { boxes: [{ min: [1, 0, 0], max: [0, 1, 1] }] },
    }).success,
    false,
  );
});
test("seed reproduces targets and random sequence", () => {
  const a = mulberry32(123),
    b = mulberry32(123);
  assert.deepEqual(
    Array.from({ length: 20 }, () => a()),
    Array.from({ length: 20 }, () => b()),
  );
  const x = run("dot-wall"),
    y = run("dot-wall");
  assert.deepEqual(
    x.targets.map((t) => t.head.toArray()),
    y.targets.map((t) => t.head.toArray()),
  );
  x.dispose();
  y.dispose();
});
test("player stops within .1s, normalizes diagonal speed and cannot tunnel through cover", () => {
  const p = run("wide-swing").player;
  const box = { min: [1, 0, -2], max: [2, 3, 2] } as {
    min: [number, number, number];
    max: [number, number, number];
  };
  p.update(1, 0, new Set(["KeyD"]), [box], 1);
  assert.equal(p.position.x, 0.75);
  const free = new Player(p.config, "free");
  free.update(1, 0, new Set(["KeyW", "KeyD"]), [], 1);
  assert.ok(Math.abs(free.speed - 6.75) < 1e-8);
  free.update(0.1, 0, new Set(), [], 1.1);
  assert.ok(free.speed < 0.001);
  const locked = new Player(p.config, "locked");
  locked.update(1, 0, new Set(["KeyD"]), [], 1);
  assert.equal(locked.speed, 0);
});
test("bloom recovers and weapon obeys fire rate", () => {
  const r = run("tap-discipline"),
    w = new Weapon(r.scenario.weapon, mulberry32(1)),
    dir = new THREE.Vector3(0, 0, -1);
  assert.equal(w.fire(dir, false, 0)!.spread, 0);
  assert.equal(w.fire(dir, false, 0.01), null);
  assert.ok(w.fire(dir, false, 0.1)!.spread > 0);
  w.update(1);
  assert.equal(w.bloom, 0);
  r.dispose();
});
test("head/body/legs hitboxes resolve separately and cover blocks damage", () => {
  const r = run("head-height");
  const t = r.targets[0];
  t.place(new THREE.Vector3(0, 0, -10));
  for (const [y, part] of [
    [1.6, "head"],
    [1, "body"],
    [0.3, "legs"],
  ] as const) {
    const ray = new THREE.Ray(
      new THREE.Vector3(part === "legs" ? 0.12 : 0, y, 0),
      new THREE.Vector3(0, 0, -1),
    );
    assert.equal(t.intersect(ray)?.part, part);
  }
  aim(r);
  r.cover.push(
    new THREE.Box3(new THREE.Vector3(-1, 0, -5), new THREE.Vector3(1, 3, -4)),
  );
  assert.equal(r.isVisible(r.camera.position, t.head), false);
  assert.equal(r.click(), false);
  assert.equal(r.damage, 0);
  r.dispose();
});
test("tracking scores zero without held input; deals continuous damage with contact", () => {
  const r = run("strafe-track");
  r.targets[0].config.movement.type = "static";
  r.targets[0].place(new THREE.Vector3(0, 1.6, -10));
  aim(r);
  r.update(0.2);
  assert.equal(r.contactTime, 0);
  assert.equal(r.damage, 0);
  r.held = true;
  r.update(0.2);
  assert.ok(Math.abs(r.damage - 20) < 0.01);
  assert.ok(Math.abs(r.summary().onTargetPercent! - 50) < 0.01);
  r.release();
  assert.equal(r.held, false);
  r.dispose();
});
test("flick to track preserves the acquired target and completes after tracking HP", () => {
  const r = run("flick-track");
  const target = r.targets[0];
  aim(r);
  r.held = true;
  r.update(0.01);
  assert.equal(r.stage.type, "track");
  assert.equal(r.targets[0], target);
  target.config.movement.type = "static";
  aim(r);
  r.update(1.6);
  assert.equal(r.cycle, 2);
  assert.equal(r.stageResults.filter((s) => s.success).length, 2);
  r.dispose();
});
test("early reaction clicks are penalized and delay target; reaction hit measures reveal time", () => {
  const r = run("reaction-test");
  assert.equal(r.targets.length, 0);
  r.click();
  assert.equal(r.records[0].early, true);
  assert.equal(r.summary().score, -100);
  r.update(3.1);
  aim(r);
  r.update(0.1);
  r.click();
  assert.ok(r.summary().reactionMs! > 0);
  assert.equal(r.hits, 1);
  r.dispose();
});
test("bots cannot shoot through cover, but win after uninterrupted visible reaction", () => {
  const r = run("pre-aim-corner");
  r.update(0.8);
  assert.equal(r.deaths, 0);
  r.player.position.x = 2;
  r.update(0.8);
  assert.equal(r.deaths, 1);
  assert.equal(r.targets.length, 0);
  r.dispose();
});
test("counter-strafe rejects stationary farming and moving shots, accepts after stop", () => {
  const r = run("counter-strafe");
  r.scenario.targets.lifetime = undefined;
  r.update(1.5);
  aim(r);
  assert.equal(r.click(), false);
  r.keys.add("KeyD");
  r.update(0.15);
  aim(r);
  r.click();
  assert.equal(r.records.at(-1)!.hit, "miss");
  r.keys.clear();
  r.update(0.15);
  aim(r);
  assert.equal(r.click(), true);
  assert.ok(r.records.at(-1)!.stopTimingMs! >= 0);
  r.dispose();
});
test("error classifier and routines use supported keys from the last five runs", () => {
  const shot: ShotRecord = {
    t: 1,
    hit: "miss",
    aimError: { yaw: 0, pitch: 4 },
    mouseSpeed: 200,
    playerSpeed: 5,
    timeSinceVisible: 0.5,
    sinceLastShot: 0.1,
    spread: 2,
    bloom: 2,
    accurateThreshold: 2,
    recoveryTime: 0.5,
    correction: "over",
  };
  assert.deepEqual(classify([shot]), {
    moving: 1,
    flicking: 1,
    overflick: 1,
    low: 1,
    spam: 1,
  });
  const routine = fixMyErrors([
    { errors: { spam: 10 } },
    { errors: { low: 2 } },
  ]);
  assert.equal(routine[0].id, "builtin/tap-discipline");
  assert.equal(routine.length, 4);
  assert.equal(
    fixMyErrors(
      Array.from({ length: 5 }, () => ({})).concat([
        { errors: { spam: 1000 } },
      ]),
    )[0].id,
    "builtin/counter-strafe",
  );
});
test("every scenario advances safely and disposal removes owned scene objects", () => {
  for (const s of definitions) {
    const r = run(s.id.split("/")[1]);
    r.update(0.25);
    r.click();
    r.update(0.25);
    r.release();
    r.dispose();
    assert.equal(r.scene.children.length, 0);
  }
});

test("head-only tracking excludes body contact", () => {
  const r = run("head-level-track");
  const t = r.targets[0];
  t.config.movement.type = "static";
  t.place(new THREE.Vector3(0, 0, -10));
  r.camera.lookAt(new THREE.Vector3(0, 1, -10));
  r.held = true;
  r.update(0.2);
  assert.equal(r.damage, 0);
  assert.equal(r.contactTime, 0);
  aim(r);
  r.update(0.2);
  assert.ok(r.damage > 0);
  r.dispose();
});
test("slice angles reveal progressively rather than all at the same edge", () => {
  const r = run("slice-the-pie");
  r.scenario.randomizeBots.dropChance = 0;
  // Use the authored centers, independent of the seed's optional bot drops and jitter.
  const visibleAt = (x: number) =>
    r.scenario.bots.map((b) =>
      r.isVisible(
        new THREE.Vector3(x, 1.6, 0),
        new THREE.Vector3(b.pos[0], 1.6, b.pos[2]),
      ),
    );
  assert.deepEqual(visibleAt(0), [false, false, false]);
  assert.deepEqual(visibleAt(0.5), [true, false, false]);
  assert.deepEqual(visibleAt(1.3), [true, true, false]);
  assert.deepEqual(visibleAt(1.8), [true, true, true]);
  r.dispose();
});
test("combo movement and return stages gate shooting and progression", () => {
  const r = run("strafe-stop-tap");
  r.scenario.bots.forEach((b) => (b.shootsBack = false));
  r.bots.forEach((b) => (b.config.shootsBack = false));
  aim(r);
  r.click();
  assert.equal(r.hits, 0);
  assert.equal(r.stage.type, "move");
  r.player.position.x = 1.2;
  r.update(0.02);
  assert.equal(r.stage.type, "tap");
  aim(r);
  r.update(0.12);
  r.click();
  assert.equal(r.stage.type, "return");
  assert.equal(r.cycle, 1);
  r.update(0.2);
  assert.equal(r.stage.type, "return");
  r.player.position.set(0, 0, 0);
  r.update(0.02);
  assert.equal(r.cycle, 2);
  assert.equal(r.stage.type, "move");
  r.dispose();
});
test("combo timeout records failure; completed final round ends the run", () => {
  const combo = run("micro-macro");
  combo.scenario.stages[0].timeLimit = 0.1;
  combo.update(0.2);
  assert.equal(combo.stageResults[0].success, false);
  combo.dispose();
  const r = run("pre-aim-corner");
  r.scenario.rounds = 1;
  r.player.position.x = 1.5;
  r.update(0.01);
  aim(r);
  r.click();
  r.update(0.8);
  assert.equal(r.done, true);
  assert.equal(r.roundsCleared, 1);
  r.dispose();
});
