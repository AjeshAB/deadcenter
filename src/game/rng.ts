/** Mulberry32: all gameplay randomness comes from the run seed. */
export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type RNG = () => number;
export const between = (rng: RNG, range: [number, number]) =>
  range[0] + rng() * (range[1] - range[0]);
