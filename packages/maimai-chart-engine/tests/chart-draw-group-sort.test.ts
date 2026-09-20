import { describe, expect, it } from "vitest";
import { drawGroupKey, sortDrawGroup } from "../src/renderers/drawGroupSort";
import fixtures from "./fixtures/touch-sorting-native.json";

describe("Draw group sort permutations", () => {
  it.each(fixtures.sortCases)("matches the captured permutation: $name", ({ keys, expected }) => {
    const rows = keys.map((key, id) => ({ key, id }));
    sortDrawGroup(rows);
    expect(rows.map((row) => row.id)).toEqual(expected);
  });

  it("encodes signed 16-bit layer orders as unsigned keys", () => {
    expect(drawGroupKey(-32768, -32768)).toBe(0);
    expect(drawGroupKey(32767, 32767)).toBe(0xffffffff);
    expect(drawGroupKey(4, 32768)).toBe(drawGroupKey(4, -32768));
    expect(drawGroupKey(4, -32769)).toBe(drawGroupKey(4, 32767));
    expect(drawGroupKey(5, -32768)).toBeGreaterThan(drawGroupKey(4, 32767));
  });
});
