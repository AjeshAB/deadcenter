import { scenarioSchema } from "./schema";
const files = import.meta.glob("./builtin/*.json", {
  eager: true,
  import: "default",
});
export const scenarios = Object.values(files)
  .map((value) => scenarioSchema.parse(value))
  .sort((a, b) =>
    a.category === "wall"
      ? -1
      : b.category === "wall"
        ? 1
        : a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
export const findScenario = (id: string) =>
  scenarios.find((s) => s.id === id) || scenarios[0];
