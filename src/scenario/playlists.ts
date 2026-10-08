import { feedback, topErrors, type ErrorKind } from "../game/analytics";
export type RoutineItem = { id: string; duration: number };
const items = (names: string[], duration: number): RoutineItem[] =>
  names.map((name) => ({ id: "builtin/" + name, duration }));
export const routines: Record<string, { name: string; items: RoutineItem[] }> =
  {
    daily: {
      name: "Daily warmup · ~10 min",
      items: items(
        [
          "reaction-test",
          "micro-correction",
          "strafe-track",
          "head-height",
          "strafe-stop-tap",
        ],
        120,
      ),
    },
    entry: {
      name: "Entry fragger · ~12 min",
      items: items(["counter-strafe", "wide-swing", "entry"], 240),
    },
    anchor: {
      name: "Anchor / Sentinel · ~10 min",
      items: items(["head-height", "hold-the-angle", "hold-flick-rehold"], 200),
    },
  };
export function fixMyErrors(
  runs: { errors?: Partial<Record<ErrorKind, number>> }[],
): RoutineItem[] {
  const counts: Partial<Record<ErrorKind, number>> = {};
  for (const run of runs.slice(0, 5))
    for (const key of Object.keys(feedback) as ErrorKind[]) {
      const n = run.errors?.[key];
      if (typeof n === "number" && Number.isFinite(n) && n > 0)
        counts[key] = (counts[key] || 0) + n;
    }
  const names: string[] = [
    ...new Set(topErrors(counts).map(([key]) => feedback[key].drill)),
  ];
  for (const fallback of [
    "counter-strafe",
    "micro-correction",
    "head-height",
    "strafe-track",
  ])
    if (!names.includes(fallback) && names.length < 4) names.push(fallback);
  return items(names.slice(0, 4), 120);
}
