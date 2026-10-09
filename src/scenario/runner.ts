import * as THREE from "three";
import { boxDistance } from "../game/bounds";
import type { Settings } from "../settings/store";
import type { Scenario } from "./schema";
import { Player } from "../game/player";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TrackingSamples } from "../game/analytics";
import { Target } from "../game/targets";
import { Bot } from "../game/bots";
import { Weapon } from "../game/weapon";
import { mulberry32, between, type RNG } from "../game/rng";
import { AimHistory, classify, type ShotRecord } from "../game/analytics";
export const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export class ScenarioRunner {
  player: Player;
  weapon: Weapon;
  rng: RNG;
  targets: Target[] = [];
  bots: Bot[] = [];
  cover: THREE.Box3[] = [];
  private bounds = new Float32Array(0);
  private revision = 0;
  scenery = new THREE.Group();
  keys = new Set<string>();
  held = false;
  time = 0;
  mouseSpeed = 0;
  records: ShotRecord[] = [];
  placements: number[] = [];
  ttk: number[] = [];
  lags: number[] = [];
  damage = 0;
  contactTime = 0;
  trackingTime = 0;
  errorIntegral = 0;
  kills = 0;
  deaths = 0;
  spots = 0;
  roundsCleared = 0;
  round = 1;
  roundResetAt = -Infinity;
  stageIndex = 0;
  cycle = 1;
  stageStarted = 0;
  stageResults: {
    cycle: number;
    stage: string;
    success: boolean;
    seconds: number;
  }[] = [];
  done = false;
  notice = "";
  seed: number;
  aim = new AimHistory();
  samples = new TrackingSamples();
  headTime = 0;
  lagTime = 0;
  aheadTime = 0;
  offTime = 0;
  aimOn = false;
  leadX = 0;
  leadY = 0;
  lagging = false;
  placement = { until: 0, error: 0, yaw: 0, pitch: 0, label: "" };
  placementAngles = {
    close: [] as number[],
    mid: [] as number[],
    deep: [] as number[],
  };
  practice = false;
  simMs = 0;
  visMs = 0;
  private accumulator = 0;
  private pool: Target[] = [];
  private direction = new THREE.Vector3();
  private scratch = new THREE.Vector3();
  private right = new THREE.Vector3();
  private inverse = new THREE.Quaternion();
  private ray = new THREE.Ray();

  private errorValue = { yaw: 0, pitch: 0 };
  private nearestValue = {
    target: null as unknown as Target,
    error: { yaw: 0, pitch: 0 },
  };
  private hitValue = {
    target: null as unknown as Target,
    hit: { distance: 0, part: "miss" as import("../game/analytics").Hit },
  };
  private botVisible = (head: THREE.Vector3) =>
    this.isVisible(this.camera.position, head);
  private aimTarget?: Target;
  private nextSpawn = 0;
  private nextRound: number | null = null;
  private moved = false;
  private stageHold = 0;
  private adaptiveScale = 1;
  private headLine?: THREE.Line;
  constructor(
    public scenario: Scenario,
    public scene: THREE.Scene,
    public camera: THREE.PerspectiveCamera,
    public settings: Settings,
    seed: number,
  ) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.player = new Player(scenario.player, scenario.movement);
    this.weapon = new Weapon(scenario.weapon, this.rng);
    this.scene.add(this.scenery);
    for (const box of scenario.map.boxes) {
      const bounds = new THREE.Box3(
        new THREE.Vector3().fromArray(box.min),
        new THREE.Vector3().fromArray(box.max),
      );
      this.cover.push(bounds);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...bounds.getSize(new THREE.Vector3()).toArray()),
        new THREE.MeshStandardMaterial({ color: "#526057", roughness: 0.9 }),
      );
      mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
      this.scenery.add(mesh);
    }
    this.syncBounds();
    if (this.scenery.children.length) {
      const geometries: THREE.BufferGeometry[] = [];
      for (const child of this.scenery.children) {
        const mesh = child as THREE.Mesh;
        mesh.updateMatrix();
        geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      this.scenery.clear();
      const merged = mergeGeometries(geometries);
      for (const g of geometries) g.dispose();
      if (merged)
        this.scenery.add(
          new THREE.Mesh(
            merged,
            new THREE.MeshLambertMaterial({ color: "#526057" }),
          ),
        );
    }
    if (scenario.hud.headLine) {
      this.headLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-10, 1.6, -12),
          new THREE.Vector3(10, 1.6, -12),
        ]),
        new THREE.LineBasicMaterial({
          color: "#d5f875",
          transparent: true,
          opacity: 0.5,
        }),
      );
      this.scenery.add(this.headLine);
    }
    if (scenario.hud.speedBar)
      for (const x of [-1.5, 1.5]) {
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.025, 2),
          new THREE.MeshBasicMaterial({ color: "#d5f875" }),
        );
        marker.position.set(x, 0.02, 0);
        this.scenery.add(marker);
      }
    // Allocate every target mesh before the first frame, including delayed spawns.
    const max = Math.max(
      settings.count,
      scenario.targets.maxAlive,
      scenario.bots.length,
      1,
    );
    const types = new Set([
      scenario.targets.type,
      ...scenario.stages.map((s) =>
        ["micro", "macro"].includes(s.type)
          ? ("dot" as const)
          : scenario.targets.type,
      ),
    ]);
    if (scenario.bots.length) types.add("humanoid");
    for (const type of types)
      for (let i = 0; i < max; i++) {
        const target = new Target(
          { ...scenario.targets, type },
          this.rng,
          settings.color,
        );
        target.group.visible = false;
        this.scene.add(target.group);
        this.pool.push(target);
      }
    this.resetCamera();
    this.begin();
  }
  get stage() {
    return this.scenario.stages[this.stageIndex];
  }
  get beam() {
    return (
      this.stage?.type === "track" ||
      (!this.stage && this.scenario.weapon.mode === "hold")
    );
  }
  get hits() {
    let hits = 0;
    for (const record of this.records) if (record.hit !== "miss") hits++;
    return hits;
  }
  get accurate() {
    return this.player.speed <= this.player.accurateThreshold;
  }
  resetCamera() {
    this.player.position.fromArray(this.scenario.player.spawn);
    this.player.velocity.set(0, 0, 0);
    this.player.prev.copy(this.player.position);
    this.camera.position
      .copy(this.player.position)
      .add(
        new THREE.Vector3(0, this.scenario.category === "wall" ? 2.5 : 1.6, 0),
      );
    if (this.scenario.category === "wall") this.camera.position.z += 8;
    this.camera.rotation.set(
      0,
      (this.scenario.player.facing * Math.PI) / 180,
      0,
    );
  }
  private syncBounds() {
    if (this.bounds.length === this.cover.length * 6) return;
    this.bounds = new Float32Array(this.cover.length * 6);
    for (let i = 0; i < this.cover.length; i++) {
      this.cover[i].min.toArray(this.bounds, i * 6);
      this.cover[i].max.toArray(this.bounds, i * 6 + 3);
    }
  }
  isVisible(a: THREE.Vector3, b: THREE.Vector3) {
    this.syncBounds();
    this.scratch.subVectors(b, a);
    const length = this.scratch.length();
    if (!length) return true;
    this.scratch.multiplyScalar(1 / length);
    return (
      boxDistance(
        this.bounds,
        a.x,
        a.y,
        a.z,
        this.scratch.x,
        this.scratch.y,
        this.scratch.z,
        length,
      ) >=
      length - 0.001
    );
  }
  private visible(target: Target) {
    return target.group.visible && target.visibleNow;
  }
  private retire(target: Target) {
    target.group.visible = false;
    target.visibleNow = false;
    const index = this.targets.indexOf(target);
    if (index >= 0) this.targets.splice(index, 1);
  }
  private clearTargets() {
    for (const t of this.targets) {
      t.group.visible = false;
      t.visibleNow = false;
    }
    this.targets.length = 0;
    this.bots.length = 0;
    this.aimTarget = undefined;
    this.aimOn = false;
    this.leadX = this.leadY = 0;
    this.placement.until = 0;
    this.aim.reset();
  }
  private begin() {
    this.clearTargets();
    this.moved = false;
    this.stageHold = 0;
    this.stageStarted = this.time;
    if (this.scenario.bots.length) this.spawnBots();
    else {
      this.nextSpawn =
        this.time + between(this.rng, this.scenario.targets.spawnDelay);
      if (this.nextSpawn <= this.time) this.fillTargets();
    }
  }
  private spawnBots() {
    const configs = this.scenario.bots.filter(
      () => this.rng() >= this.scenario.randomizeBots.dropChance,
    );
    if (!configs.length) configs.push(this.scenario.bots[0]);
    configs.forEach((config) => {
      const target = this.makeTarget({
        ...this.scenario.targets,
        type: "humanoid",
        hp: 150,
        movement: config.strafe
          ? {
              ...this.scenario.targets.movement,
              type: "strafe",
              ...config.strafe,
            }
          : { ...this.scenario.targets.movement, type: "static" },
      });
      const p = new THREE.Vector3().fromArray(config.pos);
      p.x += (this.rng() - 0.5) * 2 * this.scenario.randomizeBots.jitter;
      target.place(p);
      const bot = new Bot(config, target, this.rng);
      this.bots.push(bot);
      bot.update(0, () => false);
      target.pos.copy(target.group.position);
      target.prev.copy(target.pos);
    });
  }
  private makeTarget(config: Scenario["targets"]) {
    const target = this.pool.find(
      (t) => !this.targets.includes(t) && t.config.type === config.type,
    );
    if (!target) throw new Error("Target pool exhausted");
    target.config = config;
    target.hp = config.hp;
    target.age = 0;
    target.nextChange = 0;
    target.changedAt = null;
    target.lagRecorded = true;
    target.visibleSince = null;
    target.revealed = false;
    target.velocity.set(0, 0, 0);
    target.direction = 1;
    target.scale = 1;
    target.group.scale.setScalar(1);
    target.flashUntil = 0;
    target.respawnAt = -Infinity;
    target.visibleNow = false;
    target.group.visible = true;
    target.setAimState(
      "off",
      this.beam && this.settings.aimColors,
      this.settings.palette,
    );
    if (config.type !== "humanoid")
      target.group.children[0].scale.setScalar(config.size);
    this.revision++;
    this.targets.push(target);
    return target;
  }
  private fillTargets() {
    const count =
      this.scenario.category === "wall"
        ? this.settings.count
        : this.scenario.targets.maxAlive;
    while (this.targets.length < count) this.spawnTarget();
  }
  private spawnTarget() {
    const s = this.scenario;
    const config = structuredClone(s.targets);
    if (s.category === "wall") {
      config.size = this.settings.size;
      config.type = "dot";
    }
    if (this.stage) {
      config.hp = this.stage.hp;
      config.movement = this.stage.movement;
      if (["micro", "macro"].includes(this.stage.type)) {
        config.type = "dot";
        config.size = 0.3;
      }
    }
    const t = this.makeTarget(config);
    const distance = between(this.rng, config.distance);
    const y = config.type === "humanoid" ? 0 : 1.6;
    let position = new THREE.Vector3((this.rng() - 0.5) * 8, y, -distance);
    if (s.category === "wall") {
      for (let tries = 0; tries < 100; tries++) {
        position.set((this.rng() - 0.5) * 15, 1.1 + this.rng() * 6.2, -7.4);
        if (
          this.targets.every(
            (other) =>
              other === t ||
              other.group.position.distanceTo(position) > config.size * 2.8,
          )
        )
          break;
      }
    }
    if (s.drill === "head-height") position.z = -12;
    if (s.drill === "reaction") {
      position = this.camera.position
        .clone()
        .addScaledVector(
          this.camera.getWorldDirection(new THREE.Vector3()),
          distance,
        );
    }
    const angle =
      this.stage?.spawn?.angleFromCrosshair ||
      (s.drill === "micro" ? ([2, 10] as [number, number]) : null);
    if (angle) {
      const direction = this.camera
        .getWorldDirection(new THREE.Vector3())
        .applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          ((between(this.rng, angle) * Math.PI) / 180) *
            (this.rng() < 0.5 ? -1 : 1),
        );
      position = this.camera.position
        .clone()
        .addScaledVector(direction, distance);
      if (config.type === "humanoid") position.y -= 1.6;
    }
    if (s.drill === "micro" || this.stage?.type === "micro") {
      t.scale = this.adaptiveScale * 0.6;
      t.group.scale.setScalar(t.scale);
    }
    t.place(position);
    if (s.id === "builtin/jiggle-track" && this.kills > 0)
      t.respawnAt = this.time;
  }
  private error(target: Target) {
    const local = this.scratch
      .copy(target.head)
      .sub(this.camera.position)
      .normalize()
      .applyQuaternion(this.inverse.copy(this.camera.quaternion).invert());
    this.errorValue.yaw = (Math.atan2(local.x, -local.z) * 180) / Math.PI;
    this.errorValue.pitch =
      (Math.atan2(local.y, Math.hypot(local.x, local.z)) * 180) / Math.PI;
    return this.errorValue;
  }
  private nearest() {
    let best = Infinity;
    for (const target of this.targets) {
      if (!this.visible(target)) continue;
      const e = this.error(target),
        distance = Math.hypot(e.yaw, e.pitch);
      if (distance < best) {
        best = distance;
        this.nearestValue.target = target;
        this.nearestValue.error.yaw = e.yaw;
        this.nearestValue.error.pitch = e.pitch;
      }
    }
    return best < Infinity ? this.nearestValue : undefined;
  }
  private rayHit(direction: THREE.Vector3) {
    this.ray.set(this.camera.position, direction);
    this.syncBounds();
    const o = this.camera.position;
    let best = boxDistance(
        this.bounds,
        o.x,
        o.y,
        o.z,
        direction.x,
        direction.y,
        direction.z,
      ),
      found = false;
    for (const target of this.targets) {
      if (!target.group.visible) continue;
      const hit = target.intersect(this.ray);
      if (hit && hit.distance < best) {
        best = hit.distance;
        found = true;
        this.hitValue.target = target;
        this.hitValue.hit.distance = hit.distance;
        this.hitValue.hit.part = hit.part;
      }
    }
    return found ? this.hitValue : undefined;
  }
  warmTargets() {
    return this.pool;
  }
  click(): boolean | null {
    if (
      this.done ||
      this.nextRound !== null ||
      this.beam ||
      this.stage?.type === "flick"
    )
      return null;
    const result = this.weapon.fire(
      this.camera.getWorldDirection(new THREE.Vector3()),
      !this.accurate,
      this.time,
    );
    if (!result) return null;
    for (const t of this.targets)
      t.visibleNow =
        t.group.visible && this.isVisible(this.camera.position, t.head);
    const nearest = this.nearest();
    const candidate = this.rayHit(result.direction);
    const s = this.scenario.scoring;
    const requiresMovement = ["counter-strafe", "stop-shot"].includes(
      this.scenario.drill,
    );
    const allowed =
      (!s.onlyAccurateShots || this.accurate) &&
      (s.maxSpread === undefined || result.spread <= s.maxSpread) &&
      (s.maxMouseSpeed === undefined || this.mouseSpeed <= s.maxMouseSpeed) &&
      (!requiresMovement || this.moved) &&
      (!this.stage ||
        !["move", "return", "spot", "hold"].includes(this.stage.type));
    const hit =
      allowed && candidate && (!s.headOnly || candidate.hit.part === "head")
        ? candidate
        : undefined;
    const record: ShotRecord = {
      t: this.time,
      hit: hit?.hit.part || "miss",
      aimError: nearest ? { ...nearest.error } : null,
      mouseSpeed: this.mouseSpeed,
      playerSpeed: this.player.speed,
      timeSinceVisible:
        nearest?.target.visibleSince == null
          ? null
          : this.time - nearest.target.visibleSince,
      sinceLastShot: Number.isFinite(result.interval) ? result.interval : 999,
      spread: result.spread,
      bloom:
        result.spread -
        this.scenario.weapon.baseSpread -
        (!this.accurate ? this.scenario.weapon.moveSpread : 0),
      accurateThreshold: this.player.accurateThreshold,
      recoveryTime:
        this.scenario.weapon.bloomPerShot / this.scenario.weapon.bloomRecovery,
      correction: this.aim.correction(),
      preFlickPitch: this.aim.firstPitch,
      early: this.scenario.drill === "reaction" && !nearest,
      stopTimingMs:
        this.moved && this.accurate
          ? (this.time - this.player.stoppedAt) * 1000
          : undefined,
    };
    this.records.push(record);
    this.notice = record.early
      ? "Early click · −100"
      : !allowed
        ? requiresMovement && !this.moved
          ? "Strafe before each shot"
          : "Shot rejected · check speed / bloom"
        : hit
          ? `${hit.hit.part.toUpperCase()}${record.stopTimingMs === undefined ? "" : " · " + Math.round(record.stopTimingMs) + " ms after stopping"}`
          : "Miss";
    if (hit)
      this.dealDamage(
        hit.target,
        this.scenario.weapon.damage[hit.hit.part as "head" | "body" | "legs"],
      );
    if (this.scenario.drill === "reaction" && record.early)
      this.nextSpawn =
        this.time + between(this.rng, this.scenario.targets.spawnDelay);
    if (this.scenario.drill === "micro") {
      const recent = this.records.slice(-10),
        accuracy =
          recent.filter((r) => r.hit !== "miss").length / recent.length;
      if (recent.length === 10)
        this.adaptiveScale = THREE.MathUtils.clamp(
          this.adaptiveScale *
            (accuracy > 0.8 ? 0.95 : accuracy < 0.7 ? 1.05 : 1),
          0.4,
          2,
        );
    }
    return !!hit;
  }
  private dealDamage(target: Target, amount: number) {
    this.damage += Math.min(target.hp, amount);
    target.hp -= amount;
    if (target.hp > 0) return;
    this.kills++;
    if (target.visibleSince !== null)
      this.ttk.push((this.time - target.visibleSince) * 1000);
    const bot = this.bots.find((b) => b.target === target);
    if (bot) bot.state = "dead";
    this.retire(target);
    this.moved = false;
    if (this.stage) {
      if (
        ["flick", "track", "tap", "micro", "macro"].includes(this.stage.type) ||
        (this.stage.type === "slice" && !this.targets.length)
      )
        this.advanceStage(true);
    } else if (this.scenario.bots.length && !this.targets.length)
      this.finishRound(true);
    else
      this.nextSpawn =
        this.time + between(this.rng, this.scenario.targets.spawnDelay);
  }
  private finishRound(success: boolean) {
    if (success) this.roundsCleared++;
    else this.deaths++;
    this.notice = success ? "Angle cleared" : "Bot shot first · round lost";
    this.clearTargets();
    this.nextRound = this.time + 0.75;
  }
  private advanceStage(success: boolean) {
    if (!this.stage) return;
    this.stageResults.push({
      cycle: this.cycle,
      stage: this.stage.type,
      success,
      seconds: this.time - this.stageStarted,
    });
    const previous = this.stage.type;
    if (!success) {
      this.notice = "Stage timed out / round lost";
      this.stageIndex = 0;
      this.cycle++;
      this.resetCamera();
      this.begin();
    } else {
      this.stageIndex++;
      if (this.stageIndex >= this.scenario.stages.length) {
        this.stageIndex = 0;
        this.cycle++;
        this.roundsCleared++;
        this.resetCamera();
        this.begin();
      } else {
        this.stageStarted = this.time;
        this.stageHold = 0;
        if (
          previous === "flick" &&
          this.stage.type === "track" &&
          this.targets[0]
        ) {
          const t = this.targets[0];
          t.hp = this.stage.hp;
          t.config.movement = this.stage.movement;
          t.age = 0;
          t.nextChange = 0;
          t.anchor.copy(t.group.position);
        } else if (!this.scenario.bots.length) {
          this.clearTargets();
          this.spawnTarget();
        }
      }
    }
    if (this.cycle > this.scenario.repeat) {
      this.done = true;
      this.clearTargets();
    }
  }
  update(dt: number) {
    const started = performance.now();
    this.visMs = 0;
    // Restore simulation coordinates; rendering only sees interpolated positions.
    for (const t of this.targets) t.group.position.copy(t.pos);
    this.accumulator += dt;
    const STEP = 1 / 240;
    while (this.accumulator + 1e-10 >= STEP && !this.done) {
      this.player.prev.copy(this.player.position);
      for (const t of this.targets) t.prev.copy(t.group.position);
      this.step(STEP);
      for (const t of this.targets) t.pos.copy(t.group.position);
      this.accumulator -= STEP;
    }
    const alpha = Math.max(0, this.accumulator / STEP);
    for (const t of this.targets)
      t.group.position.lerpVectors(t.prev, t.pos, alpha);
    if (this.scenario.category !== "wall") {
      this.camera.position.lerpVectors(
        this.player.prev,
        this.player.position,
        alpha,
      );
      this.camera.position.y += 1.6;
    }
    if (!this.done && this.nextRound === null) this.evaluate(dt);
    this.simMs = performance.now() - started - this.visMs;
  }
  private step(dt: number) {
    this.time += dt;
    this.weapon.update(dt);
    if (this.nextRound !== null) {
      if (this.time >= this.nextRound) {
        this.nextRound = null;
        this.round++;
        if (this.round > this.scenario.rounds) {
          this.done = true;
          return;
        }
        this.resetCamera();
        this.begin();
        if (this.scenario.id === "builtin/slice-the-pie")
          this.roundResetAt = this.time;
      }
      return;
    }
    this.player.update(
      dt,
      this.camera.rotation.y,
      this.keys,
      this.scenario.map.boxes,
      this.time,
    );
    if (this.player.speed > this.player.accurateThreshold) this.moved = true;
    if (this.scenario.category !== "wall")
      this.camera.position
        .copy(this.player.position)
        .setY(this.player.position.y + 1.6);
    if (this.headLine) this.headLine.visible = this.time < 20;
    if (!this.scenario.bots.length && this.time >= this.nextSpawn)
      this.fillTargets();
    // Move bots before sampling reveal placement, so the sample uses this tick's position.
    const visStarted = performance.now();
    let botFired = false;
    for (const bot of this.bots) {
      if (bot.update(dt, this.botVisible)) botFired = true;
    }
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      if (!this.scenario.bots.length) {
        target.update(dt);
        target.visibleNow =
          target.group.visible &&
          this.isVisible(this.camera.position, target.head);
      }
      if (target.config.lifetime && target.age >= target.config.lifetime) {
        this.retire(target);
        i--;
        this.nextSpawn =
          this.time + between(this.rng, this.scenario.targets.spawnDelay);
        continue;
      }
      if (this.visible(target)) {
        if (target.visibleSince === null) {
          target.visibleSince = this.time;
          const e = this.error(target),
            error = Math.hypot(e.yaw, e.pitch);
          if (
            this.scenario.category === "angle-slice" ||
            this.stage?.type === "slice"
          ) {
            this.placement.until = this.time + 0.65;
            this.placement.error = error;
            this.placement.yaw = e.yaw;
            this.placement.pitch = e.pitch;
            this.placement.label =
              e.pitch > 2 && e.pitch > Math.abs(e.yaw)
                ? "LOW"
                : error <= 2
                  ? "PERFECT"
                  : error <= 6
                    ? "OK"
                    : "OFF";
            target.flashState = error <= 2 ? "on" : error <= 6 ? "near" : "off";
            target.flashUntil = this.time + 0.15;
            const depth = Math.abs(
              target.anchor.z - this.scenario.player.spawn[2],
            );
            this.placementAngles[
              depth < 10 ? "close" : depth < 16 ? "mid" : "deep"
            ].push(error);
            this.placements.push(error);
          }
          if (!target.revealed) {
            target.revealed = true;
            this.spots++;
          }
        }
      } else target.visibleSince = null;
    }
    this.visMs += performance.now() - visStarted;
    if (botFired) {
      if (this.stage) {
        this.deaths++;
        this.advanceStage(false);
      } else this.finishRound(false);
      return;
    }
    if (
      this.scenario.drill === "jiggle-info" &&
      this.bots.some((b) => b.spotted) &&
      this.targets.every((t) => !this.visible(t))
    ) {
      this.finishRound(true);
      return;
    }
  }
  private evaluate(dt: number) {
    // Visibility at the interpolated positions keeps near cues consistent with rendered cover.
    for (const t of this.targets)
      t.visibleNow =
        t.group.visible && this.isVisible(this.camera.position, t.head);
    const nearest = this.nearest();
    if (nearest) {
      if (this.aimTarget !== nearest.target) {
        this.aimTarget = nearest.target;
        this.aim.reset();
      }
      this.aim.add(this.time, nearest.error, this.mouseSpeed);
    }
    const hit = this.rayHit(this.camera.getWorldDirection(this.direction));
    this.aimOn = !!hit;
    this.leadX = this.leadY = 0;
    let stateCode = 0;
    for (const t of this.targets) {
      let state: import("../game/targets").AimState = "off";
      if (hit?.target === t)
        state =
          t.config.type === "humanoid" && hit.hit.part === "head"
            ? "head"
            : "on";
      else if (this.visible(t) && this.settings.nearZone) {
        this.scratch.copy(t.head).sub(this.camera.position);
        const dist = this.scratch.length();
        const angle = Math.acos(
          THREE.MathUtils.clamp(
            this.scratch.dot(this.direction) / (dist || 1),
            -1,
            1,
          ),
        );
        const radius =
          (t.config.type === "humanoid" ? 0.11 : t.config.size) * t.scale;
        if (angle < Math.atan(radius / dist) * this.settings.nearZone)
          state = "near";
      }
      if (state === "near") stateCode = Math.max(stateCode, 1);
      if (state === "on") stateCode = Math.max(stateCode, 2);
      if (state === "head") stateCode = 3;
      t.setAimState(
        state,
        this.beam && this.settings.aimColors,
        this.settings.palette,
        this.settings.placementPopups && t.flashUntil > this.time,
      );
    }
    if (this.beam && !hit) this.offTime += dt;
    if (this.beam && nearest && !hit) {
      this.leadX = nearest.error.yaw;
      this.leadY = -nearest.error.pitch;
      this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const velX = nearest.target.velocity.dot(this.right);
      this.lagging = Math.sign(-nearest.error.yaw) === -Math.sign(velX);
      if (Math.abs(velX) > 0.01 && Math.abs(nearest.error.yaw) > 0.01) {
        if (this.lagging) this.lagTime += dt;
        else this.aheadTime += dt;
      }
    }
    if (this.beam) this.samples.add(dt, stateCode);

    const contact =
      hit && (!this.scenario.scoring.headOnly || hit.hit.part === "head");
    if (this.beam) {
      this.trackingTime += dt;
      this.errorIntegral +=
        (nearest ? Math.hypot(nearest.error.yaw, nearest.error.pitch) : 0) * dt;
      if (contact) {
        this.contactTime += dt;
        if (!hit.target.lagRecorded && hit.target.changedAt !== null) {
          this.lags.push((hit.target.age - hit.target.changedAt) * 1000);
          hit.target.lagRecorded = true;
        }
        if (hit.hit.part === "head" && hit.target.config.type === "humanoid")
          this.headTime += dt;
        const revision = this.revision;
        if (this.held)
          this.dealDamage(
            hit.target,
            this.weapon.config.dps *
              dt *
              (hit.hit.part === "head"
                ? this.scenario.scoring.headMultiplier
                : 1),
          );
        if (this.revision !== revision || !this.targets.includes(hit.target))
          return;
      }
    }
    if (this.held && !this.beam && this.scenario.weapon.mode === "auto")
      this.click();
    if (this.stage) {
      if (this.time - this.stageStarted >= this.stage.timeLimit) {
        this.advanceStage(false);
        return;
      }
      if (this.stage.type === "flick" && contact && this.held) {
        this.advanceStage(true);
        return;
      }
      if (
        this.stage.type === "move" &&
        this.player.position.distanceTo(
          this.scratch.fromArray(this.scenario.player.spawn),
        ) > 1 &&
        nearest
      ) {
        this.advanceStage(true);
        return;
      }
      if (
        this.stage.type === "return" &&
        this.player.position.distanceTo(
          this.scratch.fromArray(this.scenario.player.spawn),
        ) < 0.4
      ) {
        this.advanceStage(true);
        return;
      }
      if (this.stage.type === "spot" && nearest) {
        this.advanceStage(true);
        return;
      }
      if (this.stage.type === "hold") {
        const aligned =
          Math.abs(this.camera.rotation.x) < (2 * Math.PI) / 180 &&
          Math.abs(
            this.camera.rotation.y -
              (this.scenario.player.facing * Math.PI) / 180,
          ) <
            (2 * Math.PI) / 180;
        this.stageHold = aligned ? this.stageHold + dt : 0;
        if (this.stageHold >= 0.4) this.advanceStage(true);
      }
    }
  }
  summary() {
    const counts = classify(this.records);
    return {
      practice: this.practice,
      palette: this.settings.palette,
      scenarioId: this.scenario.id,
      scenarioName: this.scenario.name,
      category: this.scenario.category,
      seed: this.seed,
      hits: this.hits,
      shots: this.records.length,
      duration: this.time,
      errors: counts,
      onTargetPercent: this.trackingTime
        ? (100 * this.contactTime) / this.trackingTime
        : null,
      averageError: this.trackingTime
        ? this.errorIntegral / this.trackingTime
        : null,
      reactionLagMs: mean(this.lags),
      damage: this.damage,
      placementError: mean(this.placements),
      headPercent:
        this.trackingTime && this.scenario.targets.type === "humanoid"
          ? (100 * this.headTime) / this.trackingTime
          : null,
      timeline: this.samples.timeline(),
      lagPercent: this.offTime ? (100 * this.lagTime) / this.offTime : null,
      aheadPercent: this.offTime ? (100 * this.aheadTime) / this.offTime : null,
      placementAngles: {
        close: mean(this.placementAngles.close),
        mid: mean(this.placementAngles.mid),
        deep: mean(this.placementAngles.deep),
      },
      goodReveals: this.placements.filter((e) => e <= 2).length,
      reveals: this.placements.length,
      ttk: mean(this.ttk),
      reactionMs: mean(
        this.records
          .filter((r) => r.hit !== "miss" && r.timeSinceVisible !== null)
          .map((r) => r.timeSinceVisible! * 1000),
      ),
      headshotPercent: this.hits
        ? (100 * this.records.filter((r) => r.hit === "head").length) /
          this.hits
        : null,
      kills: this.kills,
      deaths: this.deaths,
      spots: this.spots,
      roundsCleared: this.roundsCleared,
      score: Math.round(
        this.damage -
          this.deaths * this.scenario.scoring.deathPenalty -
          this.records.filter((r) => r.early).length * 100,
      ),
      stages: this.stageResults,
      records: this.records,
    };
  }
  release() {
    this.keys.clear();
    this.held = false;
    this.mouseSpeed = 0;
  }
  dispose() {
    this.release();
    this.clearTargets();
    for (const t of this.pool) t.dispose();
    this.scenery.removeFromParent();
    this.scenery.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
export type RunSummary = ReturnType<ScenarioRunner["summary"]>;
