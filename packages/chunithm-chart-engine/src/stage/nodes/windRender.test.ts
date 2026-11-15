import { describe, expect, it } from "vitest";
import type { StageScene } from "../runtime";
import { bindStageWind, stageWind } from "./wind";
const scene = () => ({ classState: new Map() }) as StageScene;
describe("Stage wind render state", () => {
  it("binds synchronized scenes before either scene accesses its wind", () => {
    const base = scene();
    const field = scene();
    bindStageWind([field, base]);
    expect(stageWind(field)).toBe(stageWind(base));
    const other = scene();
    expect(() => bindStageWind([other, base])).toThrow(
      "Stage wind: scenes were already initialized",
    );
    expect(other.classState.has("wind")).toBe(false);
  });
});
