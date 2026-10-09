export type Hit = "head" | "body" | "legs" | "miss";
export interface ShotRecord {
  t: number;
  hit: Hit;
  aimError: { yaw: number; pitch: number } | null;
  mouseSpeed: number;
  playerSpeed: number;
  timeSinceVisible: number | null;
  sinceLastShot: number;
  spread: number;
  bloom: number;
  accurateThreshold: number;
  recoveryTime: number;
  correction?: "over" | "under";
  early?: boolean;
  stopTimingMs?: number;
  preFlickPitch?: number;
}
export const feedback = {
  moving: {
    tip: "Stop before shooting — counter-strafe.",
    drill: "counter-strafe",
  },
  flicking: {
    tip: "You clicked before your crosshair stopped.",
    drill: "click-timing",
  },
  overflick: {
    tip: "Overflicking — slow the initial flick.",
    drill: "micro-correction",
  },
  underflick: {
    tip: "Underflicking — commit to the flick.",
    drill: "micro-correction",
  },
  low: { tip: "Keep your crosshair at head height.", drill: "head-height" },
  spam: { tip: "Tap slower — let spread reset.", drill: "tap-discipline" },
  late: { tip: "Correct but slow — shoot sooner.", drill: "reaction-test" },
  early: {
    tip: "Wait for the target before clicking.",
    drill: "reaction-test",
  },
} as const;
export type ErrorKind = keyof typeof feedback;
export function classify(
  shots: ShotRecord[],
): Partial<Record<ErrorKind, number>> {
  const counts: Partial<Record<ErrorKind, number>> = {};
  const add = (key: ErrorKind) => (counts[key] = (counts[key] || 0) + 1);
  for (const s of shots) {
    if (s.playerSpeed > s.accurateThreshold) add("moving");
    if (s.mouseSpeed > 100 && s.hit === "miss") add("flicking");
    if (s.correction === "over") add("overflick");
    if (s.correction === "under") add("underflick");
    if ((s.preFlickPitch ?? s.aimError?.pitch ?? 0) > 2) add("low");
    if (s.bloom > 0.5 && s.sinceLastShot < s.recoveryTime) add("spam");
    if (
      s.hit !== "miss" &&
      s.timeSinceVisible !== null &&
      s.timeSinceVisible > 0.6
    )
      add("late");
    if (s.early) add("early");
  }
  return counts;
}
export function topErrors(counts: Partial<Record<ErrorKind, number>>) {
  return (Object.entries(counts) as [ErrorKind, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
}
/** Retain signed error samples for one target; classification needs a trajectory, not a single miss. */
export class AimHistory {
  private data = new Float64Array(1024 * 4);
  private start = 0;
  private count = 0;
  reset() {
    this.start = this.count = 0;
  }
  get firstPitch() {
    return this.count ? this.data[this.start * 4 + 2] : undefined;
  }
  add(t: number, error: { yaw: number; pitch: number }, speed: number) {
    while (this.count && t - this.data[this.start * 4] >= 0.8) {
      this.start = (this.start + 1) % 1024;
      this.count--;
    }
    if (this.count === 1024) {
      this.start = (this.start + 1) % 1024;
      this.count--;
    }
    const i = ((this.start + this.count++) % 1024) * 4;
    this.data[i] = t;
    this.data[i + 1] = error.yaw;
    this.data[i + 2] = error.pitch;
    this.data[i + 3] = speed;
  }
  correction(): "over" | "under" | undefined {
    if (this.count < 5) return;
    const first = this.start * 4;
    const axis =
      Math.abs(this.data[first + 1]) > Math.abs(this.data[first + 2]) ? 1 : 2;
    const initial = this.data[first + axis];
    const last = ((this.start + this.count - 1) % 1024) * 4;
    if (Math.abs(initial) < 1 || Math.abs(this.data[last + axis]) >= 0.5)
      return;
    let paused = false,
      under = false;
    for (let n = 1; n < this.count; n++) {
      const i = ((this.start + n) % 1024) * 4;
      if (
        this.data[i + axis] * initial < 0 &&
        Math.abs(this.data[i + axis]) > 0.3
      )
        return "over";
      if (paused && this.data[i + 3] > 25) under = true;
      if (
        n < this.count - 2 &&
        this.data[i + 3] < 8 &&
        Math.abs(this.data[i + axis]) > 0.6
      )
        paused = true;
    }
    if (under) return "under";
  }
}

/** Time-weighted 100 ms buckets; bounded storage supports sessions up to two hours. */
export class TrackingSamples {
  readonly states = new Uint8Array(120 * 1000);
  readonly durations = new Float32Array(120 * 1000);
  count = 0;
  private elapsed = 0;
  private bins = new Float32Array(72000 * 4);
  add(dt: number, state: number) {
    if (this.count < this.states.length) {
      this.states[this.count] = state;
      this.durations[this.count++] = dt;
    }
    let left = dt;
    while (left > 1e-9) {
      const bin = Math.floor((this.elapsed + 1e-9) * 10);
      if (bin >= 72000) break;
      const used = Math.min(left, (bin + 1) / 10 - this.elapsed);
      this.bins[bin * 4 + state] += used;
      this.elapsed += used;
      left -= used;
    }
  }
  timeline() {
    const result: number[] = [];
    for (let i = 0; i < Math.ceil(this.elapsed * 10 - 1e-8); i++) {
      let state = 0;
      for (let j = 1; j < 4; j++)
        if (this.bins[i * 4 + j] > this.bins[i * 4 + state]) state = j;
      result.push(state);
    }
    return result;
  }
}
