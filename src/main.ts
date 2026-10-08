import "./style.css";
import {
  createIcons,
  Crosshair,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowRight,
  Play,
  RotateCcw,
  Volume2,
  Expand,
  Check,
  Copy,
  Mouse,
  Target,
  Clock3,
  Activity,
  ChevronDown,
  PanelTop,
  X,
  Pause,
  Keyboard,
  Settings2,
  Github,
  CircleHelp,
} from "lucide";
import { loadSettings, saveSettings, defaults } from "./settings/store";
import { cm360, radiansPerCount } from "./input/sens";
import { lockMouse } from "./input/mouse";
import { parseCode, encodeCode, drawCrosshair, colors } from "./crosshair/code";
import { createWorld } from "./game/world";
import { scenarios, findScenario } from "./scenario/catalog";
import { routines, fixMyErrors, type RoutineItem } from "./scenario/playlists";
import { resultsHTML, escapeHTML } from "./ui/results";
import { scenarioPreview } from "./ui/scenario-preview";
import type { RunSummary } from "./scenario/runner";
const settings = loadSettings();
let selected = findScenario("builtin/dot-wall");
let playlist: RoutineItem[] = [];
let playlistIndex = 0;
let runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
let crosshair: Record<string, string>;
try {
  crosshair = parseCode(settings.code);
} catch {
  settings.code = defaults.code;
  crosshair = parseCode(settings.code);
}
const presets: Record<string, string> = {
  classic: defaults.code,
  dot: "0;P;c;5;h;0;d;1;z;2;0b;0;1b;0",
  compact: "0;P;c;1;h;0;0l;3;0t;1;0o;1;0f;0;1b;0",
};
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const range = (
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit = "",
) =>
  `<label class="range-label" for="${id}">${label}<span><output id="${id}-value">${value}${unit}</output></span></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
$("#app").innerHTML = `
<aside class="sidebar"><a class="brand" href="#" aria-label="Deadcenter home"><span class="brand-mark">${icon("crosshair")}</span><span>deadcenter<span class="brand-dot">.</span></span></a><div class="workspace-label">YOUR TRAINING SPACE</div><nav><button class="nav-item active" data-nav="range">${icon("crosshair")}Practice range<span class="nav-index">01</span></button><button class="nav-item" data-nav="crosshair">${icon("panel-top")}Crosshair lab${icon("arrow-up-right")}</button><button class="nav-item" data-nav="history">${icon("activity")}Session history</button></nav><div class="sidebar-tip"><span class="tiny-label">A LITTLE, EVERY DAY.</span><p>Good aim isn’t luck.<br>It’s a habit.</p><span class="tip-line"></span><small>Make your next shot count.</small></div><div class="sidebar-bottom"><span class="valorant-logo">V</span><div>Built for Valorant<small>Independent. Precision focused.</small></div><span class="version">v0.1</span></div></aside>
<div class="main-shell"><header class="topbar"><span class="breadcrumb">Workspace <span>/</span> <strong>Practice range</strong></span><div class="topbar-right"><span class="local-status"><b></b> All settings saved locally</span><button class="icon-btn" id="help" aria-label="Help">${icon("circle-help")}</button><span class="avatar">DC</span></div></header>
<main><div class="page-heading"><div class="eyebrow"><span></span> LOCK IN. LEVEL UP.</div><div class="title-row"><div><h1>Your next shot, better.</h1><p>A quiet place to build precise aim. Set up, focus, and find your rhythm.</p></div><span class="game-badge"><span class="valorant-logo">V</span> VALORANT <span class="badge-divider"></span> 1:1 SENSITIVITY</span></div></div>
<div class="workspace-grid"><section class="range-column"><div class="panel range-panel"><div class="panel-heading"><div class="panel-title">${icon("crosshair")}Practice range <span class="pill">LIVE PREVIEW</span></div><button id="preview-fullscreen" class="icon-btn" aria-label="Expand range">${icon("expand")}</button></div><div id="range"><div class="range-top"><span class="range-location"><b></b> THE DOT WALL <small>PRECISION / FLICKING</small></span><span class="range-tag">RANGE 01</span></div><div class="hud" hidden><div>TIME<strong id="time">01:00</strong></div><div><span id="hits-label">HITS</span><strong id="hits">0</strong></div><div><span id="accuracy-label">ACCURACY</span><strong id="accuracy">—</strong></div></div><canvas id="aim-crosshair" aria-hidden="true"></canvas><div id="range-overlay"><span class="preview-chip">YOUR TRAINING GROUND</span><h2>Small targets.<br>Big improvements.</h2><p>One wall. Zero distractions. Just you and your aim.</p><button class="primary-btn" id="start">${icon("play")}Start training<span>↗</span></button><span class="start-hint">${icon("mouse")} Click to lock your mouse <span>•</span> Esc to pause</span></div><div class="range-bottom"><span>${icon("crosshair")} 103° HORIZONTAL FOV</span><span><b class="status-dot"></b><span id="input-mode">INPUT READY</span><span class="fps"><span id="fps">—</span> FPS</span></span></div><div id="session-modal" hidden></div></div><div class="range-caption"><span><b></b> DOT WALL <span class="caption-sep">/</span> Build speed without sacrificing precision.</span><span>BEGINNER → PRO</span></div></div>
<div class="scenario-card"><div class="scenario-icon">${icon("target")}</div><div class="scenario-copy"><div><h3>Dot wall</h3><span class="pill green">ACTIVE SCENARIO</span></div><p>Static targets. Random spawns. A stronger first shot.</p><div class="tags"><span>Flicking</span><span>Precision</span><span>Target switching</span></div></div><span class="scenario-number">01</span></div>
<div class="settings-grid"><section class="panel setting-panel"><div class="panel-heading"><div class="panel-title">${icon("mouse")}Sensitivity</div><span class="muted-badge">VALORANT</span></div><div class="panel-body"><div class="input-pair"><label>In-game sensitivity<input id="sens" type="number" min="0.01" max="5" step="0.01" value="${settings.sens}"></label><label>Mouse DPI <span class="dim">ⓘ</span><input id="dpi" type="number" min="100" max="32000" step="100" value="${settings.dpi}"></label></div><div class="sensitivity-readout"><span>Distance per 360°</span><strong id="cm">${cm360(settings.sens, settings.dpi).toFixed(2)} <small>cm</small></strong></div><p class="field-note">Same sensitivity. Same muscle memory.</p></div></section><section class="panel setting-panel"><div class="panel-heading"><div class="panel-title">${icon("sliders-horizontal")}Targets</div><button id="reset-targets" class="icon-btn" aria-label="Reset targets">${icon("rotate-ccw")}</button></div><div class="panel-body target-settings">${range("count", "Target count", 1, 30, 1, settings.count)}${range("size", "Target size", 0.1, 0.6, 0.01, settings.size)}<div class="color-row"><span>Target color</span><div id="target-colors">${["#d5f875", "#f48472", "#9ac5fa", "#dfb5ff", "#ffffff"].map((c) => `<button class="swatch ${settings.color === c ? "selected" : ""}" data-color="${c}" style="--swatch:${c}" aria-label="Target color ${c}"></button>`).join("")}<input aria-label="Custom target color" id="custom-color" type="color" value="${settings.color}"></div></div></div></section></div>
<div class="bottom-note">${icon("keyboard")} Your mouse is your controller. <kbd>LEFT CLICK</kbd> shoot <span>·</span> <kbd>ESC</kbd> pause & settings</div></section>
<aside class="config-column"><section class="panel crosshair-panel"><div class="panel-heading"><div class="panel-title">${icon("crosshair")}Your crosshair</div><span class="tiny-label">MAKE IT YOURS</span></div><div class="crosshair-preview"><div class="crosshair-grid"></div><canvas id="crosshair-preview"></canvas><span>LIVE PREVIEW</span><span class="preview-scale">1080p · 2×</span></div><div class="panel-body"><label class="field-title" for="crosshair-code">Valorant crosshair code</label><div class="code-input"><input id="crosshair-code" placeholder="Paste your crosshair code" aria-label="Valorant crosshair code"><button id="import-code" aria-label="Import crosshair code">${icon("arrow-right")}</button></div><p class="field-note" id="code-feedback">Bring your crosshair. Feel right at home.</p><div class="crosshair-presets"><button class="preset active" data-preset="classic">Classic</button><button class="preset" data-preset="dot">Dot</button><button class="preset" data-preset="compact">Compact</button></div><div class="crosshair-controls">${range("length", "Line length", 0, 20, 1, Number(crosshair["0l"] || 4))}${range("gap", "Center gap", 0, 15, 1, Number(crosshair["0o"] || 2))}${range("thickness", "Thickness", 1, 8, 1, Number(crosshair["0t"] || 2))}</div><div class="toggle-row"><label for="outlines">Outlines</label><input class="switch" id="outlines" type="checkbox" ${crosshair.h !== "0" ? "checked" : ""}></div><div class="toggle-row"><label for="center-dot">Center dot</label><input class="switch" id="center-dot" type="checkbox" ${crosshair.d === "1" ? "checked" : ""}></div><div class="color-row"><label for="crosshair-color">Crosshair color</label><input id="crosshair-color" aria-label="Crosshair color" type="color" value="#00ffff"></div><button id="copy-code" class="secondary-btn">${icon("copy")}Copy Valorant code</button></div></section>
<section class="panel session-panel"><div class="panel-heading"><div class="panel-title">${icon("clock-3")}Session setup</div></div><div class="panel-body"><label class="field-title">Session duration</label><div class="duration-options">${[30, 60, 120].map((n) => `<button data-duration="${n}" class="${settings.duration === n ? "active" : ""}">${n === 120 ? "2 min" : n + " sec"}</button>`).join("")}</div><div class="toggle-row"><label for="fullscreen">${icon("expand")}Fullscreen on start</label><input class="switch" id="fullscreen" type="checkbox" ${settings.fullscreen ? "checked" : ""}></div><div class="toggle-row"><label for="sound">${icon("volume-2")}Sound effects</label><input class="switch" id="sound" type="checkbox" ${settings.sound ? "checked" : ""}></div><div class="toggle-row"><label for="gun">${icon("mouse")}Show weapon</label><input class="switch" id="gun" type="checkbox" ${settings.gun ? "checked" : ""}></div></div></section><div class="privacy-note">${icon("check")} No accounts. No noise. Just progress.</div></aside></div><footer><span>MADE FOR THE MOMENTS THAT MATTER.</span><span>DEADCENTER <b>©</b> 2026</span></footer></main></div><div id="toast" role="status"></div><dialog id="info-dialog"><button id="close-dialog" class="icon-btn" aria-label="Close">${icon("x")}</button><div id="dialog-content"></div></dialog>`;
const scenarioCard = $(".scenario-card");
const scenarioCategories = [
  ["wall", "Precision"],
  ["tracking", "Tracking"],
  ["angle-slice", "Angle slicing"],
  ["error-fix", "Error fixing"],
  ["combo", "Combos"],
];
scenarioCard.innerHTML = `<div class="scenario-picker"><fieldset class="scenario-selection" id="scenario-selection"><legend class="field-title">TRAINING SCENARIO</legend>${scenarioCategories
  .map(
    ([category, label]) =>
      `<section class="scenario-category" aria-label="${label}"><h3>${label}</h3><div class="scenario-grid">${scenarios
        .filter((s) => s.category === category)
        .map(
          (s) =>
            `<label class="scenario-option"><input type="radio" name="training-scenario" value="${s.id}" aria-label="${escapeHTML(s.name)}"><span class="scenario-option-body">${scenarioPreview(s)}<span class="scenario-option-heading"><strong>${escapeHTML(s.name)}</strong><span class="scenario-selected-mark" aria-hidden="true">✓</span></span><span class="scenario-option-description">${escapeHTML(s.description)}</span><span class="scenario-option-mode">${s.movement === "locked" ? "Aim only" : s.movement === "strafe-only" ? "A / D movement" : "WASD movement"}</span></span></label>`,
        )
        .join("")}</div></section>`,
  )
  .join(
    "",
  )}</fieldset><p id="scenario-description" aria-live="polite"></p><div class="routine-row"><label for="routine-select">Routine</label><select id="routine-select"><option value="">Single scenario</option>${Object.entries(
  routines,
)
  .map(([id, r]) => `<option value="${id}">${r.name}</option>`)
  .join(
    "",
  )}<option value="fix">Fix my errors · ~8 min</option></select></div><p id="routine-preview" class="field-note" role="status"></p><div class="routine-row"><label for="run-seed">Run seed</label><input id="run-seed" type="number" min="0" max="4294967295" step="1" value="${runSeed}"><button id="new-seed" class="drill-link">New seed</button></div><p class="field-note">Movement and weapon values are provisional. Recoil / spray control is planned for phase 2.</p></div>`;
$(".hud").insertAdjacentHTML(
  "beforeend",
  '<div id="scenario-hud"><span id="stage-label"></span><strong id="scenario-metric">—</strong><meter id="speed-bar" min="0" max="6.75" value="0" aria-label="Player speed"></meter><span id="shot-notice" role="status"></span></div>',
);
createIcons({
  icons: {
    Crosshair,
    SlidersHorizontal,
    ArrowUpRight,
    ArrowRight,
    Play,
    RotateCcw,
    Volume2,
    Expand,
    Check,
    Copy,
    Mouse,
    Target,
    Clock3,
    Activity,
    ChevronDown,
    PanelTop,
    X,
    Pause,
    Keyboard,
    Settings2,
    Github,
    CircleHelp,
  },
});
const host = $("#range");
let world: ReturnType<typeof createWorld>;
try {
  world = createWorld(host, settings);
} catch {
  $("#range-overlay").innerHTML =
    "<h2>WebGL2 is unavailable</h2><p>Enable hardware acceleration and reopen this page in Chrome or Edge.</p>";
  throw new Error("WebGL2 unavailable");
}
function chooseScenario(id: string) {
  selected = findScenario(id);
  $("#routine-preview").textContent = playlist.length
    ? playlist.map((item) => findScenario(item.id).name).join(" → ") +
      ". Routine timing overrides session duration."
    : "";
  document
    .querySelectorAll<HTMLButtonElement>("[data-duration]")
    .forEach((button) => (button.disabled = playlist.length > 0));
  document
    .querySelectorAll<HTMLInputElement>('input[name="training-scenario"]')
    .forEach((input) => {
      input.checked = input.value === selected.id;
    });
  $("#scenario-description").textContent = selected.description;
  $(".range-location").innerHTML =
    `<b></b> ${escapeHTML(selected.name.toUpperCase())}<small>${selected.category.toUpperCase()}</small>`;
  $("#range-overlay h2").textContent = selected.name;
  $("#range-overlay p").textContent = selected.description;
  $(".range-caption > span").textContent =
    selected.name + " / " + selected.description;
  $(".bottom-note").textContent =
    selected.movement === "locked"
      ? "LEFT CLICK " +
        (selected.weapon.mode === "hold" ? "hold to track" : "shoot") +
        " · ESC pause"
      : (selected.movement === "strafe-only" ? "A/D strafe" : "WASD move") +
        " · SHIFT walk · LEFT CLICK shoot · ESC pause";
  for (const id of ["count", "size"])
    $<HTMLInputElement>("#" + id).disabled = selected.category !== "wall";
  world.configure(selected, runSeed);
}
chooseScenario(selected.id);
$("#scenario-selection").addEventListener("change", (event) => {
  const input = event.target;
  if (
    !(input instanceof HTMLInputElement) ||
    input.name !== "training-scenario"
  )
    return;
  playlist = [];
  playlistIndex = 0;
  $<HTMLSelectElement>("#routine-select").value = "";
  chooseScenario(input.value);
});
$("#routine-select").addEventListener("change", () => {
  const key = $<HTMLSelectElement>("#routine-select").value;
  playlist =
    key === "fix" ? fixMyErrors(history()) : routines[key]?.items || [];
  playlistIndex = 0;
  chooseScenario(playlist.length ? playlist[0].id : selected.id);
});
$("#run-seed").addEventListener("change", () => {
  const input = $<HTMLInputElement>("#run-seed");
  if (input.validity.valid && input.value) {
    runSeed = Number(input.value);
    world.configure(selected, runSeed);
  } else input.value = String(runSeed);
});
$("#new-seed").onclick = () => {
  runSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  $<HTMLInputElement>("#run-seed").value = String(runSeed);
  world.configure(selected, runSeed);
};
let state: "idle" | "running" | "paused" | "ended" = "idle";
let remaining = settings.duration,
  shots = 0,
  hits = 0,
  elapsed = 0,
  raw = false,
  dx = 0,
  dy = 0,
  locking = false;
let audio: AudioContext | undefined;
const redraw = () => {
  drawCrosshair($("#crosshair-preview"), crosshair, 2);
  drawCrosshair($("#aim-crosshair"), crosshair, host.clientHeight / 1080);
};
const persist = () => saveSettings(settings);
const updateCrosshair = () => {
  settings.code = encodeCode(crosshair, settings.code);
  persist();
  redraw();
  document.querySelectorAll<HTMLElement>("[data-preset]").forEach((e) => {
    const p = parseCode(presets[e.dataset.preset!]);
    e.classList.toggle(
      "active",
      Object.keys(p).length === Object.keys(crosshair).length &&
        Object.entries(p).every(([k, v]) => crosshair[k] === v),
    );
  });
};
const toast = (message: string) => {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 2800);
};
new ResizeObserver(redraw).observe(host);
redraw();
for (const id of ["sens", "dpi", "count", "size"] as const) {
  $("#" + id).addEventListener("input", () => {
    const input = $<HTMLInputElement>("#" + id);
    if (!input.validity.valid || !input.value) return;
    settings[id] = Number(input.value);
    persist();
    world.update();
    if (id === "sens" || id === "dpi")
      $("#cm").innerHTML =
        `${cm360(settings.sens, settings.dpi).toFixed(2)} <small>cm</small>`;
    else $("#" + id + "-value").textContent = input.value;
  });
}
const setColor = (color: string) => {
  settings.color = color;
  persist();
  world.update();
  document
    .querySelectorAll<HTMLElement>("[data-color]")
    .forEach((e) => e.classList.toggle("selected", e.dataset.color === color));
  $<HTMLInputElement>("#custom-color").value = color;
};
document
  .querySelectorAll<HTMLElement>("[data-color]")
  .forEach((e) => (e.onclick = () => setColor(e.dataset.color!)));
$("#custom-color").addEventListener("input", (e) =>
  setColor((e.target as HTMLInputElement).value),
);
$("#reset-targets").onclick = () => {
  settings.count = defaults.count;
  settings.size = defaults.size;
  for (const id of ["count", "size"] as const) {
    $<HTMLInputElement>("#" + id).value = String(settings[id]);
    $("#" + id + "-value").textContent = String(settings[id]);
  }
  setColor(defaults.color);
};
for (const [id, key] of [
  ["length", "0l"],
  ["gap", "0o"],
  ["thickness", "0t"],
])
  $("#" + id).addEventListener("input", (e) => {
    const value = (e.target as HTMLInputElement).value;
    crosshair[key] = value;
    $("#" + id + "-value").textContent = value;
    updateCrosshair();
  });
for (const [id, key] of [
  ["outlines", "h"],
  ["center-dot", "d"],
])
  $("#" + id).addEventListener("change", (e) => {
    crosshair[key] = (e.target as HTMLInputElement).checked ? "1" : "0";
    updateCrosshair();
  });
$("#crosshair-color").addEventListener("input", (e) => {
  crosshair.c = "8";
  crosshair.u = (e.target as HTMLInputElement).value.slice(1) + "FF";
  updateCrosshair();
});
function syncCrosshair() {
  for (const [id, key, fallback] of [
    ["length", "0l", "6"],
    ["gap", "0o", "3"],
    ["thickness", "0t", "2"],
  ]) {
    $<HTMLInputElement>("#" + id).value = crosshair[key] || fallback;
    $("#" + id + "-value").textContent = crosshair[key] || fallback;
  }
  $<HTMLInputElement>("#outlines").checked = crosshair.h !== "0";
  $<HTMLInputElement>("#center-dot").checked = crosshair.d === "1";
  $<HTMLInputElement>("#crosshair-color").value =
    crosshair.c === "8" && /^[0-9a-f]{8}$/i.test(crosshair.u || "")
      ? "#" + crosshair.u.slice(0, 6)
      : colors[Number(crosshair.c ?? 0)] || colors[0];
  updateCrosshair();
}
syncCrosshair();
$("#import-code").onclick = () => {
  try {
    const code = $<HTMLInputElement>("#crosshair-code").value;
    const parsed = parseCode(code);
    crosshair = parsed;
    settings.code = code;
    syncCrosshair();
    $("#code-feedback").textContent =
      "Crosshair imported. Ready for your next shot.";
    toast("Crosshair imported");
  } catch (e) {
    $("#code-feedback").textContent = (e as Error).message;
  }
};
$("#copy-code").onclick = async () => {
  try {
    await navigator.clipboard.writeText(settings.code);
    toast("Valorant code copied");
  } catch {
    toast("Clipboard unavailable. Your code is selected for copying.");
    $<HTMLInputElement>("#crosshair-code").value = settings.code;
    $<HTMLInputElement>("#crosshair-code").select();
  }
};

document.querySelectorAll<HTMLElement>("[data-preset]").forEach(
  (e) =>
    (e.onclick = () => {
      crosshair = parseCode(presets[e.dataset.preset!]);
      document
        .querySelectorAll("[data-preset]")
        .forEach((b) => b.classList.toggle("active", b === e));
      syncCrosshair();
    }),
);
document.querySelectorAll<HTMLElement>("[data-duration]").forEach(
  (e) =>
    (e.onclick = () => {
      settings.duration = Number(e.dataset.duration);
      persist();
      document
        .querySelectorAll("[data-duration]")
        .forEach((b) => b.classList.toggle("active", b === e));
    }),
);
for (const id of ["fullscreen", "sound", "gun"] as const)
  $("#" + id).addEventListener("change", (e) => {
    settings[id] = (e.target as HTMLInputElement).checked;
    persist();
  });
let lastAimAt = performance.now();
let lastMouseAt = 0;
function applyMovement() {
  const now = performance.now();
  if (dx || dy) {
    world.runner.mouseSpeed =
      (Math.hypot(dx, dy) * radiansPerCount(settings.sens) * 180) /
      Math.PI /
      Math.max(0.001, (now - lastAimAt) / 1000);
    lastMouseAt = now;
  } else if (now - lastMouseAt > 50) world.runner.mouseSpeed = 0;
  lastAimAt = now;
  world.camera.rotation.y -= dx * radiansPerCount(settings.sens);
  world.camera.rotation.x = Math.max(
    (-89 * Math.PI) / 180,
    Math.min(
      (89 * Math.PI) / 180,
      world.camera.rotation.x - dy * radiansPerCount(settings.sens),
    ),
  );
  dx = dy = 0;
}
const useRawEvents = "onpointerrawupdate" in window;
document.addEventListener(useRawEvents ? "pointerrawupdate" : "mousemove", ((
  e: MouseEvent,
) => {
  if (state === "running" && document.pointerLockElement === host) {
    dx += e.movementX;
    dy += e.movementY;
  }
}) as EventListener);
function sound(hit: boolean) {
  if (!settings.sound || !audio) return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.type = hit ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(hit ? 880 : 140, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    hit ? 440 : 60,
    audio.currentTime + 0.06,
  );
  gain.gain.setValueAtTime(0.06, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.09);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.1);
}
host.addEventListener("mousedown", (e) => {
  if (
    e.button !== 0 ||
    state !== "running" ||
    document.pointerLockElement !== host
  )
    return;
  applyMovement();
  world.runner.held = true;
  const hit = world.shoot();
  if (hit !== null) sound(hit);
  updateHUD();
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) world.runner.held = false;
});
document.addEventListener("keydown", (e) => {
  if (
    state !== "running" ||
    !["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(
      e.code,
    )
  )
    return;
  e.preventDefault();
  world.runner.keys.add(e.code);
});
document.addEventListener("keyup", (e) => world.runner.keys.delete(e.code));
function updateHUD() {
  const run = world.runner;
  shots = run.records.length;
  hits = run.hits;
  const beam = run.beam;
  $("#stage-label").textContent =
    (playlist.length
      ? `Routine ${playlistIndex + 1}/${playlist.length} · `
      : "") +
    (run.stage
      ? `Rep ${Math.min(run.cycle, selected.repeat)}/${selected.repeat} · ${run.stage.type.toUpperCase()}`
      : selected.bots.length
        ? `Round ${Math.min(run.round, selected.rounds)}/${selected.rounds}`
        : selected.name);
  $("#scenario-metric").textContent = beam
    ? `${run.trackingTime ? ((run.contactTime / run.trackingTime) * 100).toFixed(1) : "0.0"}% on target`
    : selected.hud.speedBar
      ? `${run.player.speed.toFixed(2)} m/s · ${run.accurate ? "ACCURATE" : "MOVING"}`
      : `${run.kills} kills · ${run.deaths} deaths`;
  const meter = $<HTMLMeterElement>("#speed-bar");
  meter.hidden = !selected.hud.speedBar;
  meter.max = run.player.config.runSpeed;
  meter.value = run.player.speed;
  meter.low = run.player.accurateThreshold;
  meter.high = run.player.accurateThreshold;
  meter.optimum = 0;
  $("#shot-notice").textContent = run.notice;
  $("#time").textContent = `${Math.floor(Math.ceil(remaining) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.ceil(remaining) % 60).toString().padStart(2, "0")}`;
  $("#hits-label").textContent = beam ? "DAMAGE" : "HITS";
  $("#accuracy-label").textContent = beam ? "ON TARGET" : "ACCURACY";
  $("#hits").textContent = beam
    ? Math.round(run.damage).toString()
    : String(hits);
  $("#accuracy").textContent = beam
    ? run.trackingTime
      ? Math.round((run.contactTime / run.trackingTime) * 100) + "%"
      : "—"
    : shots
      ? Math.round((hits / shots) * 100) + "%"
      : "—";
}
function modal(ended: boolean) {
  const element = $("#session-modal");
  element.hidden = false;
  element.innerHTML = `<div class="session-dialog"><span class="eyebrow">${ended ? "SESSION COMPLETE" : "TAKE A BREATH"}</span><h2>${ended ? "Every rep counts." : "Stay in the zone."}</h2><p>${ended ? "A little more consistent. A little more precise." : "Your session is paused. Pick up where you left off."}</p><div class="results"><div><strong>${hits}</strong><span>HITS</span></div><div><strong>${shots ? Math.round((hits / shots) * 100) : 0}%</strong><span>ACCURACY</span></div><div><strong>${(hits / Math.max(elapsed, 1)).toFixed(2)}</strong><span>HITS / SEC</span></div></div><button class="primary-btn" id="resume">${ended ? "Train again" : "Resume training"} <span>↗</span></button><div class="modal-actions"><button id="restart">Restart session</button><button id="back">Back to settings</button></div></div>`;
  if (ended) {
    const summary = world.runner.summary();
    if (
      selected.category === "tracking" ||
      selected.id === "builtin/flick-track"
    )
      $("#session-modal .results").hidden = true;
    $("#session-modal .results").insertAdjacentHTML(
      "afterend",
      resultsHTML(summary),
    );
    $("#export-run").onclick = () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(summary, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.id.replace("/", "-") + "-" + runSeed + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.querySelectorAll<HTMLElement>("[data-drill]").forEach(
      (button) =>
        (button.onclick = () => {
          leave();
          playlist = [];
          $<HTMLSelectElement>("#routine-select").value = "";
          chooseScenario(button.dataset.drill!);
        }),
    );
    if (playlistIndex + 1 < playlist.length) {
      $("#resume").insertAdjacentHTML(
        "beforebegin",
        '<button class="primary-btn" id="next-drill">Next routine drill →</button>',
      );
      $("#next-drill").onclick = () => {
        playlistIndex++;
        chooseScenario(playlist[playlistIndex].id);
        void start(true);
      };
    } else if (playlist.length)
      $("#session-modal .session-dialog > p").textContent =
        "Routine complete. Your results are saved locally.";
  }
  $("#resume").onclick = () => start(ended);
  $("#restart").onclick = () => start(true);
  $("#back").onclick = leave;
}
function leave() {
  world.runner.release();
  state = "idle";
  document.exitPointerLock();
  if (document.fullscreenElement) void document.exitFullscreen();
  document.body.classList.remove("in-session");
  $(".hud").hidden = true;
  $("#range-overlay").hidden = false;
  $("#session-modal").hidden = true;
  world.reset();
}
async function start(reset = true) {
  if (locking) return;
  locking = true;
  audio ??= new AudioContext();
  void audio.resume();
  try {
    if (settings.fullscreen && !document.fullscreenElement) {
      try {
        await host.requestFullscreen();
      } catch {
        toast("Fullscreen unavailable; starting in windowed mode.");
      }
    }
    raw = false;
    raw = await lockMouse(host);
    if (document.pointerLockElement !== host)
      throw new Error("Mouse capture unavailable. Click Start again to retry.");
    if (reset) {
      remaining = playlist[playlistIndex]?.duration || settings.duration;
      hits = shots = elapsed = 0;
      world.reset();
    }
    dx = dy = 0;
    lastAimAt = performance.now();
    world.runner.release();
    state = "running";
    document.body.classList.add("in-session");
    $("#range-overlay").hidden = true;
    $("#session-modal").hidden = true;
    $(".hud").hidden = false;
    $("#input-mode").textContent = raw ? "INPUT: RAW" : "INPUT: OS";
    $("#input-mode").classList.toggle("os-input", !raw);
    updateHUD();
  } catch (e) {
    toast(
      (e as Error).message || "Mouse capture was blocked. Try Chrome or Edge.",
    );
    if (document.fullscreenElement) void document.exitFullscreen();
  } finally {
    locking = false;
  }
}
$("#start").onclick = () => start();
$("#preview-fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await host.requestFullscreen();
  } catch {
    toast("Fullscreen is not available in this browser.");
  }
};
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "running") {
    world.runner.release();
    state = "paused";
    dx = dy = 0;
    modal(false);
  }
});
window.addEventListener("blur", () => {
  if (state === "running") document.exitPointerLock();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "running") document.exitPointerLock();
});
type Result = {
  date: string;
  hits: number;
  shots: number;
  duration: number;
} & Partial<RunSummary>;
function history(): Result[] {
  try {
    const h = JSON.parse(localStorage.getItem("deadcenter.history") || "[]");
    return Array.isArray(h)
      ? h
          .filter(
            (x) =>
              typeof x.date === "string" &&
              Number.isFinite(x.hits) &&
              Number.isFinite(x.shots) &&
              Number.isFinite(x.duration),
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
function end() {
  world.runner.release();
  state = "ended";
  document.exitPointerLock();
  try {
    localStorage.setItem(
      "deadcenter.history",
      JSON.stringify(
        [
          {
            ...world.runner.summary(),
            date: new Date().toISOString(),
            hits,
            shots,
            duration: elapsed,
          },
          ...history(),
        ].slice(0, 30),
      ),
    );
  } catch {
    /* Storage optional. */
  }
  modal(true);
}
let last = performance.now(),
  fpsTime = 0,
  frames = 0;
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (state === "running") {
    applyMovement();
    const used = Math.min(dt, remaining, 0.1);
    remaining -= used;
    elapsed += used;
    world.runner.update(used);
    updateHUD();
    if (remaining <= 0 || world.runner.done) end();
  }
  world.render(Math.min(dt, 0.1), state !== "idle");
  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    $("#fps").textContent = String(Math.round(frames / fpsTime));
    frames = fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const dialog = $<HTMLDialogElement>("#info-dialog");
$("#close-dialog").onclick = () => dialog.close();
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
$("#help").onclick = () => {
  $("#dialog-content").innerHTML =
    '<span class="eyebrow">WELCOME TO DEADCENTER</span><h2>Make practice a habit.</h2><p>Choose a scenario or routine, set your Valorant sensitivity, then hit Start training. Left click to shoot, or hold it for tracking. Movement drills use WASD (A/D for counter-strafe) and Shift to walk. Green speed means accurate. Return to cover in jiggle drills; combos show the current stage in the HUD. Results include recommended drills and a JSON shot-data download. Press Escape to pause, resume, restart, or return to settings.</p><h3>Dialed into your game</h3><p>Rotation uses 0.07° per mouse count × your sensitivity. DPI only affects the cm/360 readout. The vertical field of view stays fixed; fullscreen at 16:9 gives a 103° horizontal view.</p><h3>Raw mouse input</h3><p>Chrome and Edge can request unadjusted mouse movement. The HUD reports RAW when that request succeeds, or OS on fallback. For OS mode on Windows, use pointer speed 6/11 and turn off Enhance pointer precision.</p><p>Crosshairs are static: movement and firing-error fields are preserved, but their effects are not simulated. Hardware sensitivity and imported codes still need in-game validation.</p>';
  dialog.showModal();
};
document.querySelectorAll<HTMLElement>("[data-nav]").forEach(
  (e) =>
    (e.onclick = () => {
      if (e.dataset.nav === "crosshair") {
        $(".crosshair-panel").scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        $<HTMLInputElement>("#crosshair-code").focus({ preventScroll: true });
      } else if (e.dataset.nav === "history") {
        const rows = history();
        $("#dialog-content").innerHTML =
          `<span class="eyebrow">YOUR PROGRESS</span><h2>Session history</h2>${rows.length ? '<div class="history-list">' + rows.map((r) => `<div><span>${new Date(r.date).toLocaleString()}</span><strong>${escapeHTML(typeof r.scenarioName === "string" ? r.scenarioName : "Dot Wall")} · ${r.hits} hits</strong><span>${r.shots ? Math.round((r.hits / r.shots) * 100) : 0}% accuracy</span><span>${typeof r.onTargetPercent === "number" ? r.onTargetPercent.toFixed(1) + "% on target" : typeof r.placementError === "number" && r.category === "angle-slice" ? r.placementError.toFixed(1) + "° reveal error" : (r.hits / Math.max(r.duration, 1)).toFixed(2) + " hits/sec"}</span></div>`).join("") + "</div>" : "<p>Your first session starts a new habit. Complete a round to see your results here.</p>"}`;
        dialog.showModal();
      } else window.scrollTo({ top: 0, behavior: "smooth" });
    }),
);
