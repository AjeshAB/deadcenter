export class FrameDebug {
  enabled = false;
  private times = new Float64Array(4096);
  private frames = new Float32Array(4096);
  private cursor = 0;
  private count = 0;
  private nextText = 0;
  private lines: string[] = [];
  record(
    now: number,
    ms: number,
    sim: number,
    vis: number,
    render: number,
    calls: number,
    programs: number,
    bots: number,
  ) {
    this.times[this.cursor] = now;
    this.frames[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.frames.length;
    this.count = Math.min(this.count + 1, this.frames.length);
    if (now < this.nextText) return;
    this.nextText = now + 50;
    let total = 0,
      worst = 0,
      n = 0;
    for (let j = 0; j < this.count; j++) {
      const i = (this.cursor - 1 - j + this.frames.length) % this.frames.length;
      if (now - this.times[i] > 1000) break;
      total += this.frames[i];
      worst = Math.max(worst, this.frames[i]);
      n++;
    }
    const avg = total / (n || 1);
    this.lines = [
      `FPS ${Math.round(1000 / (avg || 1))}  frame ${ms.toFixed(1)} ms  worst(1s) ${worst.toFixed(1)} ms`,
      `sim ${sim.toFixed(2)} ms  vis ${vis.toFixed(2)} ms  render ${render.toFixed(2)} ms`,
      `draw calls ${calls}  programs ${programs}  bots ${bots}`,
    ];
  }
  draw(ctx: CanvasRenderingContext2D) {
    if (!this.enabled) return;
    ctx.save();
    ctx.fillStyle = "#09100ee8";
    ctx.fillRect(12, 80, 430, 130);
    ctx.font = "12px monospace";
    ctx.fillStyle = "#e4f3e8";
    for (let i = 0; i < this.lines.length; i++)
      ctx.fillText(this.lines[i], 22, 100 + i * 18);
    const n = Math.min(240, this.count);
    let total = 0;
    for (let j = 0; j < n; j++)
      total += this.frames[(this.cursor - 1 - j + 4096) % 4096];
    const avg = total / (n || 1);
    for (let j = 0; j < n; j++) {
      const ms = this.frames[(this.cursor - n + j + 4096) % 4096];
      ctx.strokeStyle = ms > avg * 2 ? "#ff4655" : "#3ddc97";
      ctx.beginPath();
      ctx.moveTo(22 + j * 1.7, 198);
      ctx.lineTo(22 + j * 1.7, 198 - Math.min(45, ms * 2));
      ctx.stroke();
    }
    ctx.restore();
  }
}
