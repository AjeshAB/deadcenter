export const VERTICAL_FOV =
  (2 * Math.atan(Math.tan((103 * Math.PI) / 360) / (16 / 9)) * 180) / Math.PI;
export const radiansPerCount = (sens: number) => (sens * 0.07 * Math.PI) / 180;
export const cm360 = (sens: number, dpi: number) =>
  (360 / (sens * 0.07 * dpi)) * 2.54;
