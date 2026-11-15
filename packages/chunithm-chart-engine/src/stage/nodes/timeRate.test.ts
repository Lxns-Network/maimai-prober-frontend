import { describe, expect, it } from "vitest";
import type { StageNode } from "../runtime";
import { timeRateNode } from "./timeRate";
const bits = (value: number) => new Uint32Array(Float32Array.of(value).buffer)[0];
describe("time rate node bounded settings", () => {
  function node(words: number[]): StageNode {
    const data = new DataView(new ArrayBuffer(Math.max(64, words.length * 4)));
    for (const [index, word] of words.entries()) data.setUint32(index * 4, word >>> 0, true);
    const graph = {
      u32: (at: number) => data.getUint32(at, true),
      f32: (at: number) => data.getFloat32(at, true),
      pointer: (at: number) => {
        const value = data.getUint32(at, true);
        return value || null;
      },
    };
    return {
      scene: { graph },
      record: { settings: 0 },
      extension: undefined,
    } as unknown as StageNode;
  }
  it("accepts finite curves and rejects unsupported entries", () => {
    const valid = [0, 1, 16, 0, 0, bits(0.7), 0];
    expect(() => timeRateNode.construct!(node(valid))).not.toThrow();
    expect(() =>
      timeRateNode.construct!(node([0, 2, 16, 0, bits(4), bits(0.7), 0, bits(2), bits(1), 0])),
    ).not.toThrow();
    for (const [index, value] of [
      [1, 0],
      [2, 0],
      [4, bits(-1)],
      [4, bits(NaN)],
      [5, bits(NaN)],
    ]) {
      const invalid = [...valid];
      invalid[index] = value;
      expect(() => timeRateNode.construct!(node(invalid))).toThrow(RangeError);
    }
    expect(() => timeRateNode.construct!(node([1, 1, 16, 0, bits(4), bits(0.7), 1]))).not.toThrow();
    expect(() =>
      timeRateNode.construct!(node([1, 2, 16, 0, bits(3e38), bits(1), 0, bits(3e38), bits(1), 0])),
    ).toThrow(RangeError);
  });
  it("runs its motions at the incoming rate, scales descendants, and restores the incoming rate", () => {
    const host = node([0, 1, 16, 0, 0, bits(0.7), 0]);
    timeRateNode.construct!(host);
    host.delta = 2;
    host.before = [];
    Object.assign(host, { controller: { age: 0 } });
    host.stateMotions = [];
    host.after = [];
    host.pending = [];
    Object.assign(host, { record: null, local: new Float32Array(16), world: new Float32Array(16) });
    timeRateNode.update!(host);
    expect(bits(host.delta)).toBe(bits(Math.fround(2 * Math.fround(0.7))));
    timeRateNode.afterChildren!(host);
    expect(host.delta).toBe(2);
  });
});
