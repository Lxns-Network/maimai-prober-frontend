import { describe, expect, it } from "vitest";
import { canvasBackingSize } from "../src/pages/public/Chart/chunithm/runtime/canvasSize";

describe("engine canvas backing size", () => {
  it("follows the device pixel ratio while keeping the aspect ratio", () => {
    expect(canvasBackingSize(1560, 878, 1)).toEqual({ width: 1552, height: 873 });
    expect(canvasBackingSize(960, 540, 2)).toEqual({ width: 1920, height: 1080 });
    expect(canvasBackingSize(328, 184.5, 3.5)).toEqual({ width: 1136, height: 639 });
    expect(canvasBackingSize(3840, 2160, 3)).toEqual({ width: 1920, height: 1080 });
  });

  it("holds a fixed 1080P or 4K frame whatever the layout size", () => {
    expect(canvasBackingSize(850, 478, 1, "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(canvasBackingSize(850, 478, 1, "4k")).toEqual({ width: 3840, height: 2160 });
    expect(canvasBackingSize(1920, 1080, 3, "4k")).toEqual({ width: 3840, height: 2160 });
  });

  it("never returns an empty backing", () => {
    expect(canvasBackingSize(0, 0, 1)).toEqual({ width: 16, height: 9 });
  });
});
