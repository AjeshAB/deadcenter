import type { Scenario } from "../scenario/schema";

const dot = (x: number, y: number, radius = 5) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" class="preview-target"/><circle cx="${x - 1}" cy="${y - 1}" r="${radius * 0.3}" fill="#f0ffc7" opacity=".7"/>`;
const crosshair = (x: number, y: number) =>
  `<path d="M${x - 8} ${y}h5m6 0h5M${x} ${y - 8}v5m0 6v5" class="preview-crosshair"/>`;
const person = (x: number, y: number) =>
  `<g class="preview-person"><path d="M${x} ${y + 7}v14m-7-11h14m-7 11-5 10m5-10 5 10"/>${dot(x, y, 3.5)}</g>`;
const path = (d: string) => `<path d="${d}" class="preview-path"/>`;

/** Lightweight illustrations: no additional WebGL contexts or running simulations. */
export function scenarioPreview(scenario: Scenario): string {
  let content = "";
  let view = "RANGE VIEW";
  if (scenario.map.boxes.length) {
    view = "ANGLE MAP";
    const x = (n: number) => 100 + n * 9;
    const y = (n: number) => 76 + n * 3;
    const [px, , pz] = scenario.player.spawn;
    content = scenario.bots
      .map((bot) => {
        const [bx, , bz] = bot.pos;
        return `${path(`M${x(px)} ${y(pz)}L${x(bx)} ${y(bz)}`)}${dot(x(bx), y(bz), 4)}`;
      })
      .join("");
    content += scenario.map.boxes
      .map(
        (box) =>
          `<rect x="${x(box.min[0])}" y="${y(box.min[2])}" width="${(box.max[0] - box.min[0]) * 9}" height="${(box.max[2] - box.min[2]) * 3}" rx="1" class="preview-cover"/>`,
      )
      .join("");
    content += `<path d="M${x(px)} ${y(pz) - 5}l-4 9 4-2 4 2Z" class="preview-player"/>`;
    if (scenario.movement !== "locked")
      content += `<path d="M${x(px) + 10} ${y(pz)}h25m-5-4 5 4-5 4" class="preview-crosshair"/>`;
  } else {
    content =
      '<path d="M0 76h200M35 92l35-35h60l35 35M70 57V12m60 45V12M20 37h160" class="preview-room"/>';
    const motion = scenario.targets.movement.type;
    if (scenario.category === "wall") {
      content += [
        [42, 29],
        [89, 47],
        [150, 25],
        [153, 65],
        [57, 67],
      ]
        .map(([x, y]) => dot(x, y))
        .join("");
    } else if (scenario.category === "tracking") {
      const tracks: Record<string, string> = {
        strafe: "M38 44h124m-6-4 6 4-6 4M44 40l-6 4 6 4",
        jiggle: "M77 44h46m-5-4 5 4-5 4M82 40l-5 4 5 4",
        air: "M40 65Q72-12 110 40T167 56",
        circle: "M100 65a57 22 0 1 1 .1 0",
        reactive: "M35 56l28-29 28 31 32-40 37 31",
      };
      content += path(tracks[motion] || tracks.strafe);
      content += `<g class="preview-motion preview-motion-${motion}">${scenario.targets.type === "humanoid" ? person(100, 36) : dot(100, 44, 8)}</g>`;
    } else if (scenario.category === "combo") {
      const flickTrack = scenario.stages.some(
        (stage) => stage.type === "track",
      );
      content += path("M47 56Q76 20 133 40");
      content += dot(47, 56, 3) + dot(133, 40, 8);
      if (flickTrack) content += path("M112 40h59m-5-4 5 4-5 4");
      content +=
        '<text x="44" y="77" class="preview-step">1</text><text x="130" y="65" class="preview-step">2</text>';
    } else {
      switch (scenario.drill) {
        case "micro":
          content += dot(113, 41, 3) + path("M94 45h14");
          break;
        case "reaction":
          content +=
            '<circle cx="100" cy="44" r="19" class="preview-path"/>' +
            dot(100, 44, 7) +
            '<path d="M100 19v-5m0 60v-5M75 44h-5m60 0h-5" class="preview-crosshair"/>';
          break;
        case "head-height":
          content +=
            path("M25 32h150") +
            [48, 100, 152].map((x) => person(x, 32)).join("");
          break;
        case "counter-strafe":
        case "stop-shot":
          content +=
            person(100, 25) +
            path("M48 73h104m-6-4 6 4-6 4M54 69l-6 4 6 4") +
            '<path d="M48 68v10m104-10v10" class="preview-crosshair"/><rect x="86" y="69" width="28" height="8" rx="3" class="preview-player"/>';
          break;
        case "tap-discipline":
          content +=
            person(100, 29) +
            '<circle cx="100" cy="29" r="17" class="preview-path"/>' +
            [72, 100, 128]
              .map(
                (x) =>
                  `<rect x="${x}" y="76" width="9" height="3" rx="1" class="preview-player"/>`,
              )
              .join("");
          break;
        default:
          content +=
            person(135, 28) + path("M52 60Q77 30 121 34") + crosshair(121, 34);
      }
    }
    content += crosshair(100, 44);
  }
  return `<span class="scenario-preview" aria-hidden="true"><svg viewBox="0 0 200 92" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">${content}</svg><span class="scenario-preview-label">${view}</span></span>`;
}
