import { describe, expect, it } from "vitest";
import { HUD_GAUGE_RULES, resolveHudGauge, resolveHudStockInput } from "./values";

const LIMIT = 12000;

describe("resolveHudGauge", () => {
  it("names the no-skill capacity row", () => {
    expect(HUD_GAUGE_RULES).toMatchObject({
      fixedScale: 100,
      animationLength: 1000,
      maximumCapacityIndex: 0,
      clearStockCount: 1,
      clearFixedValue: 1_200_000,
    });
    expect(HUD_GAUGE_RULES.capacities[0]).toBe(LIMIT);
  });

  it.each([-1, NaN, Infinity, LIMIT + 0.01])("refuses gauge %s", (value) => {
    expect(() => resolveHudGauge({ value, limit: LIMIT })).toThrow(RangeError);
  });

  it("refuses a limit the capacity rules do not hold", () => {
    expect(() => resolveHudGauge({ value: 0, limit: 24000 })).toThrow(RangeError);
  });
});

describe("resolveHudStockInput", () => {
  it.each([-1, 1.5, 20])("refuses stock index %s", (index) => {
    expect(() => resolveHudStockInput(resolveHudGauge({ value: 0, limit: LIMIT }), index)).toThrow(
      RangeError,
    );
  });
});
