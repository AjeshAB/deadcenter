import * as THREE from "three";
import type { Scenario } from "../scenario/schema";
import { between, type RNG } from "./rng";
import type { Hit } from "./analytics";
export class Target {
  group = new THREE.Group();
  hp: number;
  age = 0;
  visibleSince: number | null = null;
  revealed = false;
  anchor = new THREE.Vector3();
  velocity = new THREE.Vector3();
  nextChange = 0;
  changedAt: number | null = null;
  lagRecorded = true;
  direction = 1;
  scale = 1;
  constructor(
    public config: Scenario["targets"],
    public rng: RNG,
    color: string,
  ) {
    this.hp = config.hp;
    const base = new THREE.MeshBasicMaterial({ color });
    this.base = base;
    const add = (
      geometry: THREE.BufferGeometry,
      x: number,
      y: number,
      part: Hit,
    ) => {
      const mesh = new THREE.Mesh(geometry, base);
      mesh.position.set(x, y, 0);
      mesh.userData.part = part;
      this.group.add(mesh);
    };
    if (config.type === "humanoid") {
      add(HEAD, 0, 1.6, "head");
      add(BODY, 0, 1.02, "body");
      add(LEG, -0.12, 0.36, "legs");
      add(LEG, 0.12, 0.36, "legs");
    } else {
      add(SPHERE, 0, 0, "head");
      this.group.children[0].scale.setScalar(config.size);
    }
  }
  private base: THREE.Material;
  private headPoint = new THREE.Vector3();
  prev = new THREE.Vector3();
  pos = new THREE.Vector3();
  aimState: AimState = "off";
  visibleNow = false;
  flashUntil = 0;
  respawnAt = -Infinity;
  flashState: AimState = "off";
  get head() {
    return this.headPoint
      .copy(this.group.position)
      .addScaledVector(
        UP,
        this.config.type === "humanoid" ? 1.6 * this.scale : 0,
      );
  }
  private lastEnabled?: boolean;
  private lastPalette = "";
  private lastFlash = false;
  private lastFlashState: AimState = "off";
  setAimState(
    state: AimState,
    enabled = true,
    palette = "green-red",
    flash = false,
  ) {
    if (
      state === this.aimState &&
      enabled === this.lastEnabled &&
      palette === this.lastPalette &&
      flash === this.lastFlash &&
      this.flashState === this.lastFlashState
    )
      return;
    this.aimState = state;
    this.lastEnabled = enabled;
    this.lastPalette = palette;
    this.lastFlash = flash;
    this.lastFlashState = this.flashState;
    const mats = palette === "blue-orange" ? ACCESSIBLE : MATERIALS;
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      const head = mesh.userData.part === "head";
      mesh.material = flash
        ? head
          ? mats[this.flashState]
          : this.base
        : !enabled
          ? this.base
          : this.config.type !== "humanoid"
            ? mats[state]
            : head
              ? mats[state === "head" ? "head" : "off"]
              : mats[state === "on" ? "on" : "off"];
    }
  }
  place(position: THREE.Vector3) {
    this.group.position.copy(position);
    this.anchor.copy(position);
    this.prev.copy(position);
    this.pos.copy(position);
  }
  private desiredSpeed = 0;
  private lastMotionSign = 0;
  update(dt: number) {
    if (this.age === 0) this.lastMotionSign = 0;
    this.age += dt;
    const m = this.config.movement;
    if (m.type === "static") return;
    if (this.age >= this.nextChange) {
      this.direction *= -1;
      const speed =
        typeof m.speed === "number" ? m.speed : between(this.rng, m.speed);
      if (m.type !== "jiggle") this.velocity.set(this.direction * speed, 0, 0);
      this.desiredSpeed = this.direction * speed;
      if (m.type === "reactive") {
        const angle = this.rng() * Math.PI * 2;
        this.velocity.set(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed * 0.5,
          0,
        );
      }
      this.nextChange = this.age + between(this.rng, m.changeEvery);
    }
    if (m.type === "circle") {
      const speed = typeof m.speed === "number" ? m.speed : m.speed[0];
      this.velocity.set(
        Math.cos((this.age * speed) / m.radius) * speed,
        0,
        Math.sin((this.age * speed) / m.radius) * speed,
      );
      this.group.position.set(
        Math.sin((this.age * speed) / m.radius) * m.radius,
        this.anchor.y,
        Math.cos((this.age * speed) / m.radius) * -m.radius,
      );
    } else {
      if (m.type === "jiggle")
        this.velocity.x += THREE.MathUtils.clamp(
          this.desiredSpeed - this.velocity.x,
          -50 * dt,
          50 * dt,
        );
      this.group.position.addScaledVector(this.velocity, dt);
      const half = m.width / 2;
      if (Math.abs(this.group.position.x - this.anchor.x) > half) {
        this.group.position.x =
          this.anchor.x +
          Math.sign(this.group.position.x - this.anchor.x) * half;
        if (m.type !== "jiggle") this.velocity.x *= -1;
        const side = Math.sign(this.group.position.x - this.anchor.x);
        if (Math.sign(this.desiredSpeed) === side) {
          this.desiredSpeed *= -1;
          this.direction *= -1;
        }
      }
      if (m.type === "air") {
        const jump = this.age % 1.2;
        this.group.position.y =
          this.anchor.y +
          (m.gravity
            ? Math.max(0, 5.88 * jump - 4.9 * jump * jump)
            : 1.5 + Math.sin(this.age * 2.5) * 1.5);
      }
      this.group.position.y = THREE.MathUtils.clamp(
        this.group.position.y,
        this.anchor.y,
        this.anchor.y + 4,
      );
    }
    const motionSign = Math.sign(this.velocity.x);
    if (
      motionSign &&
      this.lastMotionSign &&
      motionSign !== this.lastMotionSign
    ) {
      this.changedAt = this.age;
      this.lagRecorded = false;
    }
    if (motionSign) this.lastMotionSign = motionSign;
  }
  private hit = { distance: Infinity, part: "miss" as Hit };
  private intersectSphere(
    ray: THREE.Ray,
    x: number,
    y: number,
    r: number,
    part: Hit,
  ) {
    const p = this.group.position,
      k = this.scale;
    CENTER.set(p.x + x * k, p.y + y * k, p.z);
    BALL.center.copy(CENTER);
    BALL.radius = r * k;
    if (ray.intersectSphere(BALL, POINT)) {
      const d = POINT.distanceTo(ray.origin);
      if (d < this.hit.distance) {
        this.hit.distance = d;
        this.hit.part = part;
      }
    }
  }
  private intersectCapsule(
    ray: THREE.Ray,
    x: number,
    y: number,
    r: number,
    half: number,
    part: Hit,
  ) {
    const p = this.group.position,
      k = this.scale;
    this.intersectSphere(ray, x, y - half, r, part);
    this.intersectSphere(ray, x, y + half, r, part);
    const ox = ray.origin.x - p.x - x * k,
      oz = ray.origin.z - p.z;
    const a = ray.direction.x ** 2 + ray.direction.z ** 2;
    const b = ox * ray.direction.x + oz * ray.direction.z;
    const c = ox * ox + oz * oz - (r * k) ** 2,
      disc = b * b - a * c;
    if (a > 1e-12 && disc >= 0) {
      for (let sign = -1; sign <= 1; sign += 2) {
        const d = (-b + sign * Math.sqrt(disc)) / a;
        const yy = ray.origin.y + d * ray.direction.y;
        if (
          d >= 0 &&
          Math.abs(yy - p.y - y * k) <= half * k &&
          d < this.hit.distance
        ) {
          this.hit.distance = d;
          this.hit.part = part;
        }
      }
    }
  }
  intersect(ray: THREE.Ray) {
    this.hit.distance = Infinity;
    if (this.config.type === "humanoid") {
      this.intersectSphere(ray, 0, 1.6, 0.11, "head");
      this.intersectCapsule(ray, 0, 1.02, 0.22, 0.25, "body");
      this.intersectCapsule(ray, -0.12, 0.36, 0.095, 0.25, "legs");
      this.intersectCapsule(ray, 0.12, 0.36, 0.095, 0.25, "legs");
    } else this.intersectSphere(ray, 0, 0, this.config.size, "head");
    return Number.isFinite(this.hit.distance) ? this.hit : undefined;
  }
  dispose() {
    this.group.removeFromParent();
    this.base.dispose();
  }
}

export type AimState = "off" | "near" | "on" | "head";
const UP = new THREE.Vector3(0, 1, 0),
  CENTER = new THREE.Vector3(),
  POINT = new THREE.Vector3(),
  BALL = new THREE.Sphere();
const HEAD = new THREE.SphereGeometry(0.11, 16, 12),
  BODY = new THREE.CapsuleGeometry(0.22, 0.5, 4, 12),
  LEG = new THREE.CapsuleGeometry(0.095, 0.5, 4, 8),
  SPHERE = new THREE.SphereGeometry(1, 20, 14);
function palette(off: string, on: string, head: string) {
  return {
    off: new THREE.MeshBasicMaterial({ color: off }),
    near: new THREE.MeshBasicMaterial({ color: "#ffcf4a" }),
    on: new THREE.MeshBasicMaterial({ color: on }),
    head: new THREE.MeshBasicMaterial({ color: head }),
  };
}
export const MATERIALS = palette("#ff4655", "#3ddc97", "#7dffb8");
export const ACCESSIBLE = palette("#ff922e", "#4aa8ff", "#b5e6ff");
