import { Vector3 } from "three";
import type { Scenario } from "../scenario/schema";
import { between, type RNG } from "./rng";
import { Target } from "./targets";
export class Bot {
  state: "hidden" | "peeking" | "visible" | "retreat" | "dead" = "hidden";
  seenFor = 0;
  age = 0;
  reaction: number;
  spotted = false;
  constructor(
    public config: Scenario["bots"][number],
    public target: Target,
    rng: RNG,
  ) {
    this.reaction = between(rng, config.reaction);
  }
  update(dt: number, visible: (head: Vector3) => boolean) {
    if (this.state === "dead") return false;
    this.age += dt;
    if (this.age < this.config.delay) {
      this.target.group.visible = false;
      return false;
    }
    this.target.group.visible = true;
    const t = this.age - this.config.delay;
    if (this.state === "hidden") this.state = "peeking";
    if (this.config.peekType === "swing")
      this.target.group.position.x =
        this.target.anchor.x - Math.max(0, 3 - t * this.config.peekSpeed);
    if (this.config.peekType === "jiggle") {
      this.target.group.position.x =
        this.target.anchor.x + Math.sin(t * this.config.peekSpeed * 2) * 0.6;
      this.state =
        Math.cos(t * this.config.peekSpeed * 2) < 0 ? "retreat" : "peeking";
    }
    if (this.config.peekType === "jump")
      this.target.group.position.y =
        this.target.anchor.y + Math.abs(Math.sin(t * 3)) * 1.5;
    if (this.config.strafe) this.target.update(dt);
    if (visible(this.target.head)) {
      this.seenFor += dt;
      this.state = "visible";
      this.spotted = true;
      return this.config.shootsBack && this.seenFor >= this.reaction;
    }
    this.seenFor = 0;
    return false;
  }
}
