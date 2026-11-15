import { describe, expect, it } from "vitest";
import {
  applyInstanceLayout,
  instanceAttributeLayout,
  instanceStrideBytes,
  type LayoutTarget,
} from "./instanceLayout";
import { INSTANCED_ATTRIBUTES, INSTANCED_FLOATS } from "./notePrograms";
import { INSTANCE_FLOATS } from "./instanceBuffer";

/** Records the layout calls so they can be asserted without a GL context. */
function fakeGl() {
  const calls: { index: number; size: number; stride: number; offset: number; divisor: number }[] =
    [];
  const enabled: number[] = [];
  const target: LayoutTarget = {
    vertexAttribPointer(index, size, _type, _normalized, stride, offset) {
      calls.push({ index, size, stride, offset, divisor: -1 });
    },
    enableVertexAttribArray(index) {
      enabled.push(index);
    },
    vertexAttribDivisor(index, divisor) {
      const row = calls.find((c) => c.index === index && c.divisor === -1);
      if (row) row.divisor = divisor;
    },
  };
  return { target, calls, enabled };
}

describe("instanceAttributeLayout", () => {
  it("packs the attributes end to end with no gaps and no overlap", () => {
    const layout = instanceAttributeLayout();
    let expected = 0;
    for (const attribute of layout) {
      expect({ name: attribute.name, offset: attribute.offset }).toEqual({
        name: attribute.name,
        offset: expected,
      });
      expected += attribute.size * 4;
    }
    // The last attribute ends exactly at the stride, so no byte is unused.
    expect(expected).toBe(instanceStrideBytes());
  });

  it("agrees with the buffer's per-instance stride", () => {
    // The shader and the buffer are separate descriptions of the same twenty floats; a disagreement
    // would make an instance read its neighbour's data.
    expect(instanceStrideBytes()).toBe(INSTANCE_FLOATS * 4);
    expect(INSTANCED_FLOATS).toBe(INSTANCE_FLOATS);
  });

  it("declares the attributes in the shader's order", () => {
    expect(instanceAttributeLayout().map((a) => a.name)).toEqual([...INSTANCED_ATTRIBUTES]);
  });
});

describe("applyInstanceLayout", () => {
  it("points every attribute at its own slot with a per-instance divisor", () => {
    const { target, calls, enabled } = fakeGl();
    const locations = [3, 7, 11, 15];
    applyInstanceLayout(target, locations, 0x1406);

    expect(calls.map((c) => c.index)).toEqual(locations);
    // The four matrix slots hold three floats each; twelve in total, which is the whole instance.
    expect(calls.map((c) => c.size)).toEqual([3, 3, 3, 3]);
    expect(calls.every((c) => c.stride === instanceStrideBytes())).toBe(true);
    expect(calls.map((c) => c.offset)).toEqual(instanceAttributeLayout().map((a) => a.offset));
    // A divisor of zero would advance per vertex; one advances per instance.
    expect(calls.every((c) => c.divisor === 1)).toBe(true);
    expect([...enabled].sort((a, b) => a - b)).toEqual([...locations].sort((a, b) => a - b));
  });

  it("gives each attribute a distinct offset", () => {
    const { target, calls } = fakeGl();
    applyInstanceLayout(target, [0, 1, 2, 3], 0x1406);
    expect(new Set(calls.map((c) => c.offset)).size).toBe(calls.length);
  });

  it("throws when an attribute is not active in the program", () => {
    const { target } = fakeGl();
    // A negative location means the shader optimized the attribute away; binding the remaining
    // slots would shift every value by one.
    expect(() => applyInstanceLayout(target, [0, 1, 2, -1], 0x1406)).toThrow(/not active/);
  });

  it("throws when the location count does not match the layout", () => {
    const { target } = fakeGl();
    expect(() => applyInstanceLayout(target, [0, 1, 2], 0x1406)).toThrow(/4 attributes/);
  });
});
