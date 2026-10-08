import { z } from "zod";
const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const range = z
  .tuple([nonnegative, nonnegative])
  .refine(([a, b]) => b >= a, "Range must be ordered");
const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const boxSchema = z
  .object({ min: vector, max: vector })
  .refine(
    (b) => b.min.every((v, i) => v < b.max[i]),
    "Box must have positive volume",
  );
const motion = z
  .object({
    type: z
      .enum(["static", "strafe", "jiggle", "air", "circle", "reactive"])
      .default("static"),
    speed: z.union([positive, range]).default(5.4),
    changeEvery: range.default([0.3, 1.1]),
    width: positive.default(6),
    radius: positive.default(4),
    gravity: z.boolean().default(true),
  })
  .default({
    type: "static",
    speed: 5.4,
    changeEvery: [0.3, 1.1],
    width: 6,
    radius: 4,
    gravity: true,
  });
export const weaponSchema = z.object({
  mode: z.enum(["tap", "hold", "auto"]).default("tap"),
  fireRate: positive.max(60).default(10),
  dps: positive.default(100),
  baseSpread: nonnegative.default(0),
  moveSpread: nonnegative.default(0),
  bloomPerShot: nonnegative.default(0),
  bloomRecovery: positive.default(5),
  damage: z
    .object({ head: positive, body: positive, legs: positive })
    .default({ head: 150, body: 50, legs: 35 }),
});
const targetSchema = z.object({
  type: z.enum(["dot", "sphere", "humanoid"]).default("dot"),
  maxAlive: z.number().int().min(1).max(30).default(1),
  hp: positive.default(100),
  size: positive.default(0.3),
  distance: range.default([10, 18]),
  spawnDelay: range.default([0, 0]),
  lifetime: positive.optional(),
  movement: motion,
});
const botSchema = z.object({
  pos: vector,
  peekType: z.enum(["swing", "jiggle", "hold", "jump"]).default("hold"),
  peekSpeed: positive.default(5.4),
  reaction: range.default([0.3, 0.45]),
  shootsBack: z.boolean().default(true),
  delay: nonnegative.default(0),
  strafe: z.object({ speed: positive, changeEvery: range }).optional(),
});
export const stageSchema = z.object({
  type: z.enum([
    "flick",
    "track",
    "move",
    "tap",
    "return",
    "slice",
    "spot",
    "hold",
    "micro",
    "macro",
  ]),
  label: z.string().default(""),
  timeLimit: positive.default(12),
  hp: positive.default(100),
  spawn: z.object({ angleFromCrosshair: range }).optional(),
  movement: motion,
});
export const scenarioSchema = z
  .object({
    id: z.string().regex(/^builtin\/[a-z0-9-]+$/),
    name: z.string().min(1),
    description: z.string().default(""),
    category: z.enum(["wall", "tracking", "angle-slice", "error-fix", "combo"]),
    duration: positive.max(1200).default(60),
    movement: z.enum(["locked", "strafe-only", "free"]).default("locked"),
    player: z
      .object({
        spawn: vector.default([0, 0, 0]),
        facing: z.number().finite().default(0),
        runSpeed: positive.default(6.75),
        walkSpeed: positive.default(3.8),
        accel: positive.default(67.5),
        decel: positive.default(67.5),
        accurateSpeedRatio: z.number().min(0).max(1).default(0.3),
      })
      .prefault({}),
    map: z
      .object({ boxes: z.array(boxSchema).max(100).default([]) })
      .prefault({}),
    weapon: weaponSchema.prefault({}),
    targets: targetSchema.prefault({}),
    bots: z.array(botSchema).max(30).default([]),
    rounds: z.number().int().min(1).max(100).default(10),
    randomizeBots: z
      .object({
        jitter: nonnegative.default(0),
        dropChance: z.number().min(0).max(1).default(0),
      })
      .prefault({}),
    stages: z.array(stageSchema).max(20).default([]),
    repeat: z.number().int().min(1).max(100).default(20),
    hud: z
      .object({
        speedBar: z.boolean().default(false),
        stopTiming: z.boolean().default(false),
        headLine: z.boolean().default(false),
      })
      .prefault({}),
    scoring: z
      .object({
        metric: z
          .enum([
            "score",
            "onTargetPercent",
            "placementError",
            "reactionMs",
            "ttk",
            "spots",
          ])
          .default("score"),
        headMultiplier: positive.default(1),
        deathPenalty: nonnegative.default(500),
        onlyAccurateShots: z.boolean().default(false),
        headOnly: z.boolean().default(false),
        maxSpread: nonnegative.optional(),
        maxMouseSpeed: positive.optional(),
        perStage: z.boolean().default(false),
      })
      .prefault({}),
    drill: z
      .enum([
        "standard",
        "reaction",
        "micro",
        "counter-strafe",
        "stop-shot",
        "tap-discipline",
        "head-height",
        "click-timing",
        "pre-aim",
        "jiggle-info",
      ])
      .default("standard"),
  })
  .superRefine((s, ctx) => {
    if (s.category === "combo" && !s.stages.length)
      ctx.addIssue({
        code: "custom",
        message: "Combos require stages",
        path: ["stages"],
      });
    if (s.category === "angle-slice" && !s.bots.length)
      ctx.addIssue({
        code: "custom",
        message: "Angle drills require bots",
        path: ["bots"],
      });
  });
export type Scenario = z.infer<typeof scenarioSchema>;
export type Box = z.infer<typeof boxSchema>;
export type WeaponConfig = z.infer<typeof weaponSchema>;
