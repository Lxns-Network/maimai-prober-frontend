import { describe, expect, it } from "vitest";
import { instanceUvBytes } from "./instanceUv";

const quantized = (values: readonly number[]) => {
  const out = Float32Array.from(values);
  instanceUvBytes(out);
  return [...out];
};

describe("UV transform carried in an instance colour", () => {
  it("reads an identity transform back as the bytes it packs to", () => {
    expect(quantized([0, 1, 1, 1])).toEqual([0, 254 / 255, 254 / 255, 254 / 255].map(Math.fround));
  });
});
