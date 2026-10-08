import * as THREE from "three";
import type { Settings } from "../settings/store";
import type { Scenario } from "./schema";
import { Player } from "../game/player";
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
    return this.records.filter((s) => s.hit !== "miss").length;
  }
  get accurate() {
    return this.player.speed <= this.player.accurateThreshold;
  }
  resetCamera() {
    this.player.position.fromArray(this.scenario.player.spawn);
    this.player.velocity.set(0, 0, 0);
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
  isVisible(a: THREE.Vector3, b: THREE.Vector3) {
    const direction = b.clone().sub(a),
      length = direction.length();
    const ray = new THREE.Ray(a, direction.normalize()),
      point = new THREE.Vector3();
    return !this.cover.some(
      (box) =>
        ray.intersectBox(box, point) && point.distanceTo(a) < length - 0.001,
    );
  }
  private visible(target: Target) {
    return (
      target.group.visible && this.isVisible(this.camera.position, target.head)
    );
  }
  private clearTargets() {
    this.targets.forEach((t) => t.dispose());
    this.targets = [];
    this.bots = [];
    this.aimTarget = undefined;
    this.aim.samples = [];
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
    });
  }
  private makeTarget(config: Scenario["targets"]) {
    const target = new Target(config, this.rng, this.settings.color);
    this.targets.push(target);
    this.scene.add(target.group);
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
  }
  private error(target: Target) {
    const direction = target.head.sub(this.camera.position).normalize();
    const local = direction.applyQuaternion(
      this.camera.quaternion.clone().invert(),
    );
    return {
      yaw: (Math.atan2(local.x, -local.z) * 180) / Math.PI,
      pitch:
        (Math.atan2(local.y, Math.hypot(local.x, local.z)) * 180) / Math.PI,
    };
  }
  private nearest() {
    return this.targets
      .filter((t) => this.visible(t))
      .map((target) => ({ target, error: this.error(target) }))
      .sort(
        (a, b) =>
          Math.hypot(a.error.yaw, a.error.pitch) -
          Math.hypot(b.error.yaw, b.error.pitch),
      )[0];
  }
  private rayHit(direction: THREE.Vector3) {
    const ray = new THREE.Ray(this.camera.position, direction);
    const point = new THREE.Vector3();
    let coverDistance = Infinity;
    for (const box of this.cover)
      if (ray.intersectBox(box, point))
        coverDistance = Math.min(coverDistance, point.distanceTo(ray.origin));
    return this.targets
      .filter((t) => t.group.visible)
      .map((target) => ({ target, hit: target.intersect(ray) }))
      .filter(
        (
          entry,
        ): entry is {
          target: Target;
          hit: { distance: number; part: "head" | "body" | "legs" | "miss" };
        } => !!entry.hit && entry.hit.distance < coverDistance,
      )
      .sort((a, b) => a.hit.distance - b.hit.distance)[0];
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
      aimError: nearest?.error || null,
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
      preFlickPitch: this.aim.samples[0]?.pitch,
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
    this.targets = this.targets.filter((t) => t !== target);
    target.dispose();
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
    // Bound integration steps, while allowing the entire active interval to advance.
    for (let left = dt; left > 1e-8 && !this.done;) {
      const step = Math.min(left, 1 / 120);
      left -= step;
      this.step(step);
    }
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
        .add(new THREE.Vector3(0, 1.6, 0));
    if (this.headLine) this.headLine.visible = this.time < 20;
    if (!this.scenario.bots.length && this.time >= this.nextSpawn)
      this.fillTargets();
    // Move bots before sampling reveal placement, so the sample uses this tick's position.
    const botFired = this.bots
      .map((bot) =>
        bot.update(dt, (head) => this.isVisible(this.camera.position, head)),
      )
      .some(Boolean);
    for (const target of [...this.targets]) {
      if (!this.bots.some((b) => b.target === target)) target.update(dt);
      if (target.config.lifetime && target.age >= target.config.lifetime) {
        this.targets = this.targets.filter((t) => t !== target);
        target.dispose();
        this.nextSpawn =
          this.time + between(this.rng, this.scenario.targets.spawnDelay);
        continue;
      }
      if (this.visible(target)) {
        if (target.visibleSince === null) {
          target.visibleSince = this.time;
          if (!target.revealed) {
            const e = this.error(target);
            this.placements.push(Math.hypot(e.yaw, e.pitch));
            target.revealed = true;
            this.spots++;
          }
        }
      } else target.visibleSince = null;
    }
    const nearest = this.nearest();
    if (nearest) {
      if (this.aimTarget !== nearest.target) {
        this.aimTarget = nearest.target;
        this.aim.samples = [];
      }
      this.aim.add(this.time, nearest.error, this.mouseSpeed);
    }
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
    const hit = this.rayHit(this.camera.getWorldDirection(new THREE.Vector3()));
    const contact =
      hit && (!this.scenario.scoring.headOnly || hit.hit.part === "head");
    if (this.beam && nearest) {
      this.trackingTime += dt;
      this.errorIntegral +=
        Math.hypot(nearest.error.yaw, nearest.error.pitch) * dt;
      if (contact && this.held) {
        this.contactTime += dt;
        if (!hit.target.lagRecorded && hit.target.changedAt !== null) {
          this.lags.push((hit.target.age - hit.target.changedAt) * 1000);
          hit.target.lagRecorded = true;
        }
        this.dealDamage(
          hit.target,
          this.weapon.config.dps *
            dt *
            (hit.hit.part === "head"
              ? this.scenario.scoring.headMultiplier
              : 1),
        );
        if (!this.targets.includes(hit.target)) return;
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
          new THREE.Vector3().fromArray(this.scenario.player.spawn),
        ) > 1 &&
        nearest
      ) {
        this.advanceStage(true);
        return;
      }
      if (
        this.stage.type === "return" &&
        this.player.position.distanceTo(
          new THREE.Vector3().fromArray(this.scenario.player.spawn),
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
      goodReveals: this.placements.filter((e) => e < 2).length,
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
