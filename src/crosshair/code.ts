export type Crosshair = Record<string, string>;
export const colors = [
  "#ffffff",
  "#00ff00",
  "#7fff00",
  "#dfff00",
  "#ffff00",
  "#00ffff",
  "#ff00ff",
  "#ff0000",
];
export function parseCode(code: string): Crosshair {
  const parts = code.trim().split(";");
  if (parts[0] !== "0" || !parts.includes("P"))
    throw new Error(
      "Paste a Valorant code containing a primary (P) crosshair.",
    );
  const result: Crosshair = {};
  let i = parts.indexOf("P") + 1;
  for (; i < parts.length && !["A", "S"].includes(parts[i]); i += 2) {
    if (
      !parts[i + 1] ||
      !/^[a-z0-9]+$/i.test(parts[i]) ||
      !/^[a-z0-9.]+$/i.test(parts[i + 1])
    )
      throw new Error("This crosshair code looks incomplete.");
    result[parts[i]] = parts[i + 1];
  }
  return result;
}
export function encodeCode(values: Crosshair, original = "0;P"): string {
  const parts = original.split(";");
  const section = parts.findIndex(
    (part, i) => i > parts.indexOf("P") && ["A", "S"].includes(part),
  );
  return `0;P;${Object.entries(values).flat().join(";")}${section >= 0 ? ";" + parts.slice(section).join(";") : ""}`;
}
export function drawCrosshair(
  canvas: HTMLCanvasElement,
  code: Crosshair,
  scale = 1,
) {
  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  canvas.width = 160 * dpr;
  canvas.height = 160 * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 160, 160);
  ctx.translate(80, 80);
  ctx.scale(scale, scale);
  const n = (key: string, fallback: number) => {
    const v = Number(code[key] ?? fallback);
    return Number.isFinite(v) ? Math.max(0, Math.min(40, v)) : fallback;
  };
  const color =
    code.c === "8" && /^[0-9a-f]{8}$/i.test(code.u || "")
      ? "#" + code.u
      : colors[Number(code.c ?? 0)] || colors[0];
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    opacity: number,
  ) => {
    if (code.h !== "0") {
      ctx.globalAlpha = n("o", 0.5);
      ctx.fillStyle = "#000";
      const t = n("t", 1);
      ctx.fillRect(x - t, y - t, w + t * 2, h + t * 2);
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fillRect(x, y, w, h);
  };
  for (const p of ["0", "1"]) {
    if (code[p + "b"] === "0" || (p === "1" && !code["1b"])) continue;
    const length = n(p + "l", 6),
      thick = n(p + "t", 2),
      gap = n(p + "o", 3),
      alpha = n(p + "a", 1);
    const vertical = code[p + "g"] === "1" ? n(p + "v", length) : length;
    rect(gap, -thick / 2, length, thick, alpha);
    rect(-gap - length, -thick / 2, length, thick, alpha);
    rect(-thick / 2, gap, thick, vertical, alpha);
    rect(-thick / 2, -gap - vertical, thick, vertical, alpha);
  }
  if (code.d === "1") {
    const size = n("z", 2);
    rect(-size / 2, -size / 2, size, size, n("a", 1));
  }
  ctx.globalAlpha = 1;
}
