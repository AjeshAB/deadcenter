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
    const add = (
      geometry: THREE.BufferGeometry,
      pos: [number, number, number],
      part: Hit,
      shade: string,
    ) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: shade, roughness: 0.65 }),
      );
      mesh.position.fromArray(pos);
      mesh.userData.part = part;
      this.group.add(mesh);
    };
    if (config.type === "humanoid") {
      add(
        new THREE.SphereGeometry(0.11, 16, 12),
        [0, 1.6, 0],
        "head",
        "#f5efcb",
      );
      add(
        new THREE.CapsuleGeometry(0.22, 0.5, 4, 12),
        [0, 1.02, 0],
        "body",
        color,
      );
      for (const x of [-0.12, 0.12])
        add(
          new THREE.CapsuleGeometry(0.095, 0.5, 4, 8),
          [x, 0.36, 0],
          "legs",
          color,
        );
    } else
      add(
        new THREE.SphereGeometry(config.size, 20, 14),
        [0, 0, 0],
        "head",
        color,
      );
  }
  get head() {
    return this.group.position
      .clone()
      .add(
        new THREE.Vector3(
          0,
          this.config.type === "humanoid" ? 1.6 * this.scale : 0,
          0,
        ),
      );
  }
  place(position: THREE.Vector3) {
    this.group.position.copy(position);
    this.anchor.copy(position);
  }
  update(dt: number) {
    this.age += dt;
    const m = this.config.movement;
    if (m.type === "static") return;
    if (this.age >= this.nextChange) {
      this.direction *= -1;
      const speed =
        typeof m.speed === "number" ? m.speed : between(this.rng, m.speed);
      this.velocity.set(this.direction * speed, 0, 0);
      if (m.type === "reactive") {
        const angle = this.rng() * Math.PI * 2;
        this.velocity.set(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed * 0.5,
          0,
        );
      }
      this.nextChange = this.age + between(this.rng, m.changeEvery);
      this.changedAt = this.age;
      this.lagRecorded = false;
    }
    if (m.type === "circle") {
      const speed = typeof m.speed === "number" ? m.speed : m.speed[0];
      this.group.position.set(
        Math.sin((this.age * speed) / m.radius) * m.radius,
        this.anchor.y,
        Math.cos((this.age * speed) / m.radius) * -m.radius,
      );
    } else {
      this.group.position.addScaledVector(this.velocity, dt);
      const half = m.width / 2;
      if (Math.abs(this.group.position.x - this.anchor.x) > half) {
        this.group.position.x =
          this.anchor.x +
          Math.sign(this.group.position.x - this.anchor.x) * half;
        this.velocity.x *= -1;
        this.direction *= -1;
        this.changedAt = this.age;
        this.lagRecorded = false;
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
  }
  intersect(ray: THREE.Ray): { distance: number; part: Hit } | undefined {
    this.group.updateMatrixWorld(true);
    const caster = new THREE.Raycaster(ray.origin, ray.direction);
    const hit = caster.intersectObjects(this.group.children, false)[0];
    if (hit)
      return { distance: hit.distance, part: hit.object.userData.part as Hit };
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
