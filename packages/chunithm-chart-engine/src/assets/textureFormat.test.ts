import { describe, expect, it } from "vitest";
import { chooseTextureTarget, type DeviceSignals } from "./textureFormat";

const desktop: DeviceSignals = {
  s3tc: true,
  astc: false,
  etc2: false,
  mobile: false,
  deviceMemoryGb: 8,
  maxTextureSize: 16384,
};
const phoneLow: DeviceSignals = {
  s3tc: false,
  astc: true,
  etc2: true,
  mobile: true,
  deviceMemoryGb: 4,
  maxTextureSize: 4096,
};
const phoneHigh: DeviceSignals = {
  s3tc: false,
  astc: true,
  etc2: true,
  mobile: true,
  deviceMemoryGb: 8,
  maxTextureSize: 8192,
};
const bare: DeviceSignals = {
  s3tc: false,
  astc: false,
  etc2: false,
  mobile: true,
  deviceMemoryGb: null,
  maxTextureSize: 4096,
};

describe("chooseTextureTarget", () => {
  it("uses BC on desktop", () =>
    expect(chooseTextureTarget(desktop, null)).toEqual({
      target: "bc",
      dropTopMip: false,
      compare: false,
    }));
  it("uses ASTC on a phone without ample memory", () =>
    expect(chooseTextureTarget(phoneLow, null).target).toBe("astc"));
  it("uses ASTC even on a phone with ample memory", () =>
    expect(chooseTextureTarget(phoneHigh, null).target).toBe("astc"));
  it("falls back to ETC2 when ASTC is missing", () =>
    expect(chooseTextureTarget({ ...phoneLow, astc: false }, null).target).toBe("etc2"));
  it("falls back to RGBA8 with a dropped top mip when nothing is supported", () =>
    expect(chooseTextureTarget(bare, null)).toEqual({
      target: "rgba8",
      dropTopMip: true,
      compare: false,
    }));
  it("honours an explicit override", () =>
    expect(chooseTextureTarget({ ...desktop, astc: true }, "astc").target).toBe("astc"));
  it("compare mode forces full-resolution RGBA8", () =>
    expect(chooseTextureTarget(bare, "compare")).toEqual({
      target: "rgba8",
      dropTopMip: false,
      compare: true,
    }));
  it("ignores an override the device cannot decode", () =>
    expect(chooseTextureTarget(desktop, "etc2").target).toBe("bc"));
  it("ignores unknown override strings", () =>
    expect(chooseTextureTarget(desktop, "foo").target).toBe("bc"));
});
