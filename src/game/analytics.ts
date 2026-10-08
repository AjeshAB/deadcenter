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
  samples: { t: number; yaw: number; pitch: number; speed: number }[] = [];
  add(t: number, error: { yaw: number; pitch: number }, speed: number) {
    this.samples.push({ t, ...error, speed });
    this.samples = this.samples.filter((s) => t - s.t < 0.8);
  }
  correction(): "over" | "under" | undefined {
    const s = this.samples;
    if (s.length < 5) return;
    const axis = Math.abs(s[0].yaw) > Math.abs(s[0].pitch) ? "yaw" : "pitch";
    if (Math.abs(s[0][axis]) < 1) return;
    if (
      s.some(
        (p, i) => i > 0 && p[axis] * s[0][axis] < 0 && Math.abs(p[axis]) > 0.3,
      ) &&
      Math.abs(s.at(-1)![axis]) < 0.5
    )
      return "over";
    if (
      s.some(
        (p, i) =>
          i > 0 &&
          i < s.length - 2 &&
          p.speed < 8 &&
          Math.abs(p[axis]) > 0.6 &&
          s.slice(i + 1).some((q) => q.speed > 25),
      ) &&
      Math.abs(s.at(-1)![axis]) < 0.5
    )
      return "under";
  }
}
