import { describe, expect, it } from "vitest";
import { compileDeviceState } from "../gpu/deviceState";
import { depthParticleEffectState } from "./renderState";
import fixture from "./depthParticleState.fixture.json";
describe("particle blend states", () => {
  it("equals the reference conversion of every class the stage nodes use", () => {
    for (const { flags, commands } of fixture) {
      const expected = compileDeviceState(commands as [number, number][], "reference");
      expect(
        Array.from(depthParticleEffectState(flags).values),
        `flags ${flags.toString(16)}`,
      ).toEqual(Array.from(expected.values));
    }
  });
  it("refuses inherited and out-of-range blend modes", () => {
    expect(() => depthParticleEffectState(0x2de000)).toThrow(RangeError);
    expect(() => depthParticleEffectState(0x2de008)).toThrow(RangeError);
  });
});
