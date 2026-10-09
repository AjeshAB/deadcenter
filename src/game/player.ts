import { Vector3 } from "three";
import type { Box, Scenario } from "../scenario/schema";
export class Player {
  position = new Vector3();
  prev = new Vector3();
  private desired = new Vector3();
  private delta = new Vector3();
  private up = new Vector3(0, 1, 0);
  velocity = new Vector3();
  stoppedAt = 0;
  wasMoving = false;
  constructor(
    public config: Scenario["player"],
    public movement: Scenario["movement"],
  ) {
    this.position.fromArray(config.spawn);
    this.prev.copy(this.position);
  }
  get speed() {
    return this.velocity.length();
  }
  get accurateThreshold() {
    return this.config.runSpeed * this.config.accurateSpeedRatio;
  }
  update(
    dt: number,
    yaw: number,
    keys: Set<string>,
    boxes: Box[],
    time: number,
  ) {
    const right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const forward =
      this.movement === "free"
        ? Number(keys.has("KeyW")) - Number(keys.has("KeyS"))
        : 0;
    const desired = this.desired.set(right, 0, -forward);
    if (this.movement === "locked") desired.set(0, 0, 0);
    desired
      .normalize()
      .applyAxisAngle(this.up, yaw)
      .multiplyScalar(
        keys.has("ShiftLeft") || keys.has("ShiftRight")
          ? this.config.walkSpeed
          : this.config.runSpeed,
      );
    // Small steps plus swept per-axis bounds prevent tunnelling and slide along cover.
    for (let left = dt; left > 1e-8;) {
      const step = Math.min(left, 1 / 120);
      left -= step;
      const delta = this.delta.copy(desired).sub(this.velocity);
      this.velocity.add(
        delta.clampLength(
          0,
          (desired.lengthSq() ? this.config.accel : this.config.decel) * step,
        ),
      );
      for (const axis of AXES) {
        const other = axis === "x" ? "z" : "x";
        const i = axis === "x" ? 0 : 2,
          j = i === 0 ? 2 : 0;
        const old = this.position[axis];
        let next = old + this.velocity[axis] * step;
        for (const b of boxes) {
          if (b.max[1] <= this.position.y || b.min[1] >= this.position.y + 1.8)
            continue;
          if (
            this.position[other] <= b.min[j] - 0.25 ||
            this.position[other] >= b.max[j] + 0.25
          )
            continue;
          const min = b.min[i] - 0.25,
            max = b.max[i] + 0.25;
          if (old <= min && next > min) next = min;
          if (old >= max && next < max) next = max;
        }
        if (Math.abs(next - (old + this.velocity[axis] * step)) > 1e-9)
          this.velocity[axis] = 0;
        this.position[axis] = Math.max(-28, Math.min(28, next));
      }
    }
    const moving = this.speed > this.accurateThreshold;
    if (this.wasMoving && !moving) this.stoppedAt = time;
    this.wasMoving = moving;
  }
}

const AXES = ["x", "z"] as const;
