import { feedback, topErrors } from "../game/analytics";
import type { RunSummary } from "../scenario/runner";
export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const value = (n: number | null, unit = "", decimals = 1) =>
  n === null ? "—" : n.toFixed(decimals) + unit;
export function resultsHTML(r: RunSummary) {
  let metrics: [string, string][];
  if (r.category === "tracking" || r.scenarioId === "builtin/flick-track")
    metrics = [
      ["On target", value(r.onTargetPercent, "%")],
      ["Aim error", value(r.averageError, "°")],
      ...(r.headPercent === null
        ? []
        : ([["Head contact", value(r.headPercent, "%")]] as [
            string,
            string,
          ][])),
      ["Reacquire lag", value(r.reactionLagMs, " ms", 0)],
      ["Damage", value(r.damage, "", 0)],
    ];
  else if (r.category === "angle-slice")
    metrics = [
      ["Reveal error", value(r.placementError, "°")],
      ["Good reveals (≤2°)", `${r.goodReveals}/${r.reveals}`],
      ["Time to kill", value(r.ttk, " ms", 0)],
      ["Deaths", String(r.deaths)],
      ["Clears", String(r.roundsCleared)],
      ["Spots", String(r.spots)],
    ];
  else
    metrics = [
      ["Score", String(r.score)],
      ["Headshots", value(r.headshotPercent, "%")],
      ["Reaction", value(r.reactionMs, " ms", 0)],
      ["Kills", String(r.kills)],
    ];
  const tracking = r.onTargetPercent !== null;
  const palette =
    r.palette === "blue-orange"
      ? ["#ff922e", "#ffcf4a", "#4aa8ff", "#b5e6ff"]
      : ["#ff4655", "#ffcf4a", "#3ddc97", "#7dffb8"];
  const timeline = tracking
    ? `<h3>Tracking timeline</h3><p>One bar per 100 ms · off / near / on / head</p><div class="aim-timeline" role="img" aria-label="Aim contact timeline">${r.timeline.map((state, i) => `<i style="background:${palette[state]}" title="${(i / 10).toFixed(1)} s · ${["off", "near", "on", "head"][state]}"></i>`).join("")}</div><p>Lagging ${value(r.lagPercent, "%")} · Ahead ${value(r.aheadPercent, "%")} of off-target time. Remaining time has no clear horizontal lead/lag.</p>${r.lagPercent !== null && r.lagPercent > 50 ? "<p>You react late; anticipate direction changes.</p>" : ""}`
    : "";
  const angles = Object.entries(r.placementAngles).filter(
    (entry): entry is [string, number] => entry[1] !== null,
  );
  const worst = angles.reduce<[string, number] | undefined>(
    (a, b) => (!a || b[1] > a[1] ? b : a),
    undefined,
  );
  const placement = angles.length
    ? `<h3>Placement by angle</h3><ul>${angles.map(([name, error]) => `<li>${name}: ${value(error, "°")}${name === worst?.[0] ? " · worst angle" : ""}</li>`).join("")}</ul>`
    : "";
  const errors = topErrors(r.errors);
  const stages = [...new Set(r.stages.map((s) => s.stage))]
    .map((name) => {
      const rows = r.stages.filter((s) => s.stage === name);
      return `<li>${escapeHTML(name)} · ${rows.filter((s) => s.success).length}/${rows.length} passed · ${value(rows.reduce((n, s) => n + s.seconds, 0) / rows.length, " s")} average</li>`;
    })
    .join("");
  return `<div class="scenario-results"><p>${escapeHTML(r.scenarioName)} · seed ${r.seed}${r.practice ? " · PRACTICE (not saved to scored history)" : ""}</p><div class="metric-grid">${metrics.map(([label, n]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join("")}</div>${timeline}${placement}${errors.length ? `<h3>Focus for your next run</h3><ul>${errors.map(([key, n]) => `<li>${feedback[key].tip} <b>×${n}</b> <button class="drill-link" data-drill="builtin/${feedback[key].drill}">Practice drill ↗</button></li>`).join("")}</ul>` : "<p>No repeated shot errors detected.</p>"}${stages ? `<h3>Combo stages</h3><ul>${stages}</ul>` : ""}<button class="secondary-btn" id="export-run">Download shot data</button><small>Prototype tuning · movement, hitboxes, timing thresholds, and correction labels need in-game validation. Reacquire lag is time to regain aim contact after a direction change. Head contact uses total tracking time. Placement depths: close under 10 m, mid under 16 m, deep 16 m and beyond.</small></div>`;
}
