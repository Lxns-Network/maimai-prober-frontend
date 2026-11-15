import { describe, expect, it } from "vitest";
import { hexByte } from "./hexByte";

describe("hexByte", () => {
  it("reads every byte value in either letter case, and an undefined byte as zero", () => {
    for (let value = 0; value < 256; value++) {
      const text = value.toString(16).padStart(2, "0");
      expect(hexByte(`--${text}`, 2)).toBe(value);
      expect(hexByte(text.toUpperCase(), 0)).toBe(value);
    }
    expect(hexByte("ab--", 2)).toBe(0);
  });

  it("rejects a pair that is neither hex nor undefined", () => {
    expect(() => hexByte("g0", 0)).toThrow(RangeError);
    expect(() => hexByte("0-", 0)).toThrow(RangeError);
    expect(() => hexByte("0", 0)).toThrow(RangeError);
  });
});
