export const defaultCode = "0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0";
export const defaults = {
  sens: 0.35,
  dpi: 800,
  count: 8,
  size: 0.28,
  color: "#d5f875",
  duration: 60,
  fullscreen: false,
  sound: true,
  gun: true,
  code: defaultCode,
};
export type Settings = typeof defaults;
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem("deadcenter.settings") || "{}",
    );
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (typeof saved[key] === typeof defaults[key])
        Object.assign(result, { [key]: saved[key] });
    }
    result.sens = Math.max(0.01, Math.min(5, result.sens));
    result.dpi = Math.max(100, Math.min(32000, result.dpi));
    result.count = Math.round(Math.max(1, Math.min(30, result.count)));
    result.size = Math.max(0.1, Math.min(0.6, result.size));
    if (![30, 60, 120].includes(result.duration)) result.duration = 60;
    if (!/^#[0-9a-f]{6}$/i.test(result.color)) result.color = defaults.color;
    return result;
  } catch {
    return { ...defaults };
  }
}
export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem("deadcenter.settings", JSON.stringify(settings));
  } catch {
    /* Session remains usable without storage. */
  }
}
