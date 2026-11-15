import { describe, expect, it } from "vitest";
import { add, exact, mul, neg, precisionBits, round, sub, toF32 } from "./stripFloat";

describe("extended-precision arithmetic", () => {
  // Every expected value below comes from calling the reference implementation directly
  // (probe `.bench/chunithm-p3-oracle/probe-strip.mjs`). Values keep the exact mantissa/exponent pair the
  // reference produces, which is not always the minimal normalised form.
  it("represents a double exactly", () => {
    expect(exact(1.5)).toEqual({ m: 6755399441055744n, e: -52 });
    expect(exact(0)).toEqual({ m: 0n, e: 0 });
    expect(exact(-1.5)).toEqual({ m: -6755399441055744n, e: -52 });
  });

  it("rejects a non-finite operand", () => {
    expect(() => exact(Infinity)).toThrow(RangeError);
    expect(() => exact(NaN)).toThrow(RangeError);
  });

  it("multiplies and adds without precision loss", () => {
    expect(mul(exact(1.5), exact(4))).toEqual({ m: 30423614405477505635920876929024n, e: -102 });
    expect(add(exact(1), exact(2))).toEqual({ m: 13510798882111488n, e: -52 });
    expect(sub(exact(1), exact(0.5))).toEqual({ m: 4503599627370496n, e: -53 });
    expect(neg(exact(2))).toEqual({ m: -4503599627370496n, e: -51 });
  });

  it("keeps the product of two doubles exact before rounding", () => {
    // 0.1 is not representable, so the exact product needs more than 53 bits; rounding to 64 keeps
    // it and the single-precision store rounds once more.
    const extended = round(mul(exact(1.5), exact(0.1)), precisionBits("extended"));
    expect(toF32(extended)).toBe(0.15000000596046448);
    expect(toF32(extended)).toBe(Math.fround(0.15));
  });

  it("rounds a tie to the even mantissa", () => {
    // Reference results for a 2-bit target: 3 -> unchanged (3 bits already), 5 -> {2, e+1},
    // 7 -> {4, e+1}. Both ties resolve to the even value.
    expect(round(exact(3), 2)).toEqual({ m: 3n, e: 0 });
    expect(round(exact(5), 2)).toEqual({ m: 2n, e: 1 });
    expect(round(exact(7), 2)).toEqual({ m: 4n, e: 1 });
  });

  it("stores to single precision with one rounding", () => {
    expect(toF32(exact(1))).toBe(1);
    expect(toF32(exact(0))).toBe(0);
    expect(toF32(exact(0.5))).toBe(0.5);
    expect(toF32(mul(exact(1.25), exact(2)))).toBe(2.5);
  });

  it("rejects a store that would be subnormal or overflow", () => {
    expect(() => toF32(exact(2 ** 128))).toThrow(RangeError);
    expect(() => toF32(exact(2 ** -140))).toThrow(RangeError);
  });

  it("selects the precision bit count", () => {
    expect(precisionBits("single")).toBe(24);
    expect(precisionBits("extended")).toBe(64);
    expect(() => precisionBits("double" as never)).toThrow(TypeError);
  });
});
