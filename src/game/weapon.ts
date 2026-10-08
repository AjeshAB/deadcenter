import { Vector3 } from "three";
import type { WeaponConfig } from "../scenario/schema";
import type { RNG } from "./rng";
export class Weapon {
  bloom = 0;
  lastShot = -Infinity;
  constructor(
    public config: WeaponConfig,
    private rng: RNG,
  ) {}
  update(dt: number) {
    this.bloom = Math.max(0, this.bloom - this.config.bloomRecovery * dt);
  }
  spread(moving: boolean) {
    return (
      this.config.baseSpread +
      this.bloom +
      (moving ? this.config.moveSpread : 0)
    );
  }
  fire(direction: Vector3, moving: boolean, time: number) {
    if (time - this.lastShot < 1 / this.config.fireRate - 1e-8) return null;
    const spread = this.spread(moving),
      interval = time - this.lastShot;
    this.lastShot = time;
    this.bloom += this.config.bloomPerShot;
    const radius = Math.tan((spread * Math.PI) / 180) * Math.sqrt(this.rng());
    const angle = this.rng() * Math.PI * 2;
    const right = new Vector3()
      .crossVectors(direction, new Vector3(0, 1, 0))
      .normalize();
    const up = new Vector3().crossVectors(right, direction).normalize();
    return {
      direction: direction
        .clone()
        .addScaledVector(right, radius * Math.cos(angle))
        .addScaledVector(up, radius * Math.sin(angle))
        .normalize(),
      spread,
      interval,
    };
  }
}
