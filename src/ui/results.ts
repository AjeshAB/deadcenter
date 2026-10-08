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
      ["Reacquire lag", value(r.reactionLagMs, " ms", 0)],
      ["Damage", value(r.damage, "", 0)],
    ];
  else if (r.category === "angle-slice")
    metrics = [
      ["Reveal error", value(r.placementError, "°")],
      ["Good reveals (<2°)", `${r.goodReveals}/${r.reveals}`],
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
  const errors = topErrors(r.errors);
  const stages = [...new Set(r.stages.map((s) => s.stage))]
    .map((name) => {
      const rows = r.stages.filter((s) => s.stage === name);
      return `<li>${escapeHTML(name)} · ${rows.filter((s) => s.success).length}/${rows.length} passed · ${value(rows.reduce((n, s) => n + s.seconds, 0) / rows.length, " s")} average</li>`;
    })
    .join("");
  return `<div class="scenario-results"><p>${escapeHTML(r.scenarioName)} · seed ${r.seed}</p><div class="metric-grid">${metrics.map(([label, n]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join("")}</div>${errors.length ? `<h3>Focus for your next run</h3><ul>${errors.map(([key, n]) => `<li>${feedback[key].tip} <b>×${n}</b> <button class="drill-link" data-drill="builtin/${feedback[key].drill}">Practice drill ↗</button></li>`).join("")}</ul>` : "<p>No repeated shot errors detected.</p>"}${stages ? `<h3>Combo stages</h3><ul>${stages}</ul>` : ""}<button class="secondary-btn" id="export-run">Download shot data</button><small>Prototype tuning · movement, hitboxes, timing thresholds, and correction labels need in-game validation. Reacquire lag is time to regain beam contact after a direction change.</small></div>`;
}
