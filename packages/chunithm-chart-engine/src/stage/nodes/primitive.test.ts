import { describe, expect, it } from "vitest";
import { fillPositions, primitiveGeometry, vertexColour } from "./primitive";
import { stagePrimitiveOrder, stagePrimitiveState } from "../render/stagePrimitives";
describe("primitive geometry", () => {
  const base = {
    values: [0, 10, 20, 0, 100, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    depth: -1,
    rect: [0, 0, 1, 1],
    textureMode: 0,
    transform: 1,
  };
  it("builds the rectangle and its centre anchor", () => {
    const g = primitiveGeometry({ ...base, mode: 0, anchor: 16 });
    expect(Array.from(g.corners)).toEqual([10, 20, 10, 60, 110, 20, 110, 60]);
    expect(Array.from(g.pivot)).toEqual([60, 40]);
  });
  it("centres modes 2 and 3 on the origin", () => {
    const g = primitiveGeometry({ ...base, mode: 2, anchor: 16 });
    expect(Array.from(g.pivot)).toEqual([0, 0]);
    expect(Array.from(g.corners)).toEqual([-50, -20, -50, 20, 50, -20, 50, 20]);
  });
  it("rejects an unknown rectangle mode", () => {
    expect(() => primitiveGeometry({ ...base, mode: 9, anchor: 0 })).toThrow(RangeError);
  });
});
describe("primitive colours and fills", () => {
  it("swaps the first and third colour bytes", () => {
    expect(vertexColour(0xff39bde5)).toBe(0xffe5bd39);
  });
  it("covers the whole target", () => {
    const p = fillPositions(1920, 1080);
    expect(Array.from(p.slice(0, 6))).toEqual([0, 0, 0, 1920, 0, 0]);
    expect(Array.from(p.slice(15, 18))).toEqual([1920, 1080, 0]);
  });
});
describe("primitive draw state", () => {
  it("maps blend rows and node flags", () => {
    expect(stagePrimitiveState(0x11, 3)).toMatchObject({
      blend: true,
      source: 4,
      destination: 5,
      depthTest: true,
      depthWrite: false,
      colorMask: 15,
    });
    expect(stagePrimitiveState(0x31, 4)).toMatchObject({ destination: 1, depthTest: false });
    expect(() => stagePrimitiveState(0, 1)).toThrow(RangeError);
  });
});
describe("2D pass ranges", () => {
  const node = (layer: number, priority: number) =>
    ({ record: { layer, priority }, parent: null }) as unknown as Parameters<
      typeof stagePrimitiveOrder
    >[0];
  it("sends keys below 0x8000 to the back pass and the rest to the front pass", () => {
    expect(stagePrimitiveOrder(node(0, 0x7f))).toEqual({ pass: 4, key: 0xff });
    expect(stagePrimitiveOrder(node(1, 1))).toEqual({ pass: 24, key: 0x8181 });
    expect(stagePrimitiveOrder(node(0, 127)).pass).toBe(4);
  });
});
