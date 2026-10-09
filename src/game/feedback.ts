import { Vector3 } from "three";
import type { ScenarioRunner } from "../scenario/runner";
import type { Settings } from "../settings/store";
const projected = new Vector3();
const screenRight = new Vector3();
export function drawFeedback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  run: ScenarioRunner,
  settings: Settings,
) {
  const x = width / 2,
    y = height / 2;
  const on = settings.palette === "blue-orange" ? "#4aa8ff" : "#3ddc97";
  const off = settings.palette === "blue-orange" ? "#ff922e" : "#ff4655";
  ctx.save();
  ctx.font = "bold 13px monospace";
  if (
    run.beam &&
    settings.leadArrow &&
    !run.aimOn &&
    (run.leadX || run.leadY)
  ) {
    ctx.save();
    ctx.translate(x, y);
    const angle = Math.atan2(run.leadY, run.leadX);
    ctx.rotate(angle);
    ctx.fillStyle = run.lagging ? "#ff922e" : "#4aa8ff";
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.lineTo(29, -5);
    ctx.lineTo(29, 5);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = run.lagging ? "#ff922e" : "#4aa8ff";
    ctx.textAlign = "center";
    ctx.fillText(run.lagging ? "LAG" : "AHEAD", x, y + 52);
  }
  const roundProgress = (run.time - run.roundResetAt) / 0.35;
  if (roundProgress >= 0 && roundProgress < 1) {
    // A screen-space cue remains visible when all reset bots are behind cover.
    drawResetPulse(ctx, x, y, 20, roundProgress);
    ctx.save();
    ctx.globalAlpha = 1 - roundProgress;
    ctx.fillStyle = "#f0ffe4";
    ctx.textAlign = "center";
    ctx.fillText("ROUND " + run.round, x, y + 76);
    ctx.restore();
  }
  const p = run.placement;
  if (settings.placementPopups && p.until > run.time) {
    ctx.fillStyle = p.error <= 2 ? on : p.error <= 6 ? "#ffcf4a" : off;
    ctx.textAlign = "center";
    ctx.fillText(p.label + " " + p.error.toFixed(1) + "°", x, y - 52);
    if (p.error > 6) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(-p.pitch, p.yaw));
      ctx.beginPath();
      ctx.moveTo(55, 0);
      ctx.lineTo(46, -5);
      ctx.lineTo(46, 5);
      ctx.fill();
      ctx.restore();
    }
  }
  for (const t of run.targets) {
    if (!t.group.visible || !t.visibleNow) continue;
    projected.copy(t.head).project(run.camera);
    if (projected.z > 1 || projected.z < -1) continue;
    const tx = ((projected.x + 1) * width) / 2,
      ty = ((1 - projected.y) * height) / 2;
    const resetProgress = (run.time - t.respawnAt) / 0.35;
    if (resetProgress >= 0 && resetProgress < 1) {
      // Canvas-only pulse: target size, hitbox and instant aim colors stay exact.
      screenRight.set(1, 0, 0).applyQuaternion(run.camera.quaternion);
      projected
        .copy(t.head)
        .addScaledVector(screenRight, t.config.size * t.scale)
        .project(run.camera);
      const radius = Math.abs(((projected.x + 1) * width) / 2 - tx);
      drawResetPulse(ctx, tx, ty, radius, resetProgress);
    }
    if (settings.aimColors && t.aimState === "head" && run.beam) {
      ctx.strokeStyle = on;
      ctx.shadowColor = on;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (t.config.hp > 0) {
      projected.copy(t.head);
      projected.y +=
        (t.config.type === "humanoid" ? 0.11 : t.config.size) * t.scale;
      projected.project(run.camera);
      const barY = ((1 - projected.y) * height) / 2 - 8;
      ctx.fillStyle = "#101714";
      ctx.fillRect(tx - 20, barY, 40, 3);
      ctx.fillStyle = on;
      ctx.fillRect(
        tx - 20,
        barY,
        40 * Math.max(0, Math.min(1, t.hp / t.config.hp)),
        3,
      );
    }
  }
  if (
    settings.ghostMarker &&
    run.practice &&
    run.scenario.category === "angle-slice"
  ) {
    let next: (typeof run.targets)[number] | undefined;
    for (const t of run.targets)
      if (
        !t.revealed &&
        (!next || Math.abs(t.anchor.z) < Math.abs(next.anchor.z))
      )
        next = t;
    if (next) {
      projected.copy(next.head).project(run.camera);
      if (projected.z > -1 && projected.z < 1) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(
          ((projected.x + 1) * width) / 2,
          ((1 - projected.y) * height) / 2,
          7,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawResetPulse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  progress: number,
) {
  const expansion = 1 - (1 - progress) ** 3;
  const ringRadius = radius + 5 + expansion * 26;
  ctx.save();
  ctx.globalAlpha = (1 - progress) ** 2;
  ctx.strokeStyle = "#f0ffe4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const inner = ringRadius + 5,
      outer = inner + 6 * (1 - progress);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}
