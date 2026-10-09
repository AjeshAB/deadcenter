/** Slab test for a normalized ray. Parallel rays on slab boundaries are valid. */
export function boxDistance(
  boxes: Float32Array,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  limit = Infinity,
) {
  let nearest = limit;
  for (let i = 0; i < boxes.length; i += 6) {
    let near = 0,
      far = nearest;
    for (let axis = 0; axis < 3; axis++) {
      const o = axis === 0 ? ox : axis === 1 ? oy : oz;
      const d = axis === 0 ? dx : axis === 1 ? dy : dz;
      const min = boxes[i + axis],
        max = boxes[i + 3 + axis];
      if (Math.abs(d) < 1e-12) {
        if (o < min || o > max) {
          far = -1;
          break;
        }
      } else {
        const a = (min - o) / d,
          b = (max - o) / d;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (far < near) break;
      }
    }
    if (far >= near) nearest = Math.min(nearest, near);
  }
  return nearest;
}
