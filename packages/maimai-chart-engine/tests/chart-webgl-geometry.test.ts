import { parseSimaiChart } from "../src/core/parser/SimaiParser";
import { NoteRenderer } from "../src/renderers/NoteRenderer";
import type { RenderContext } from "../src/renderers/BaseRenderer";
import { HI_SPEED_CONVERSION_FACTOR } from "../src/utils/constants";
import { describe, expect, it } from "vitest";
import {
  flattenArc,
  flattenArcTo,
  strokeOutline,
  triangulateFill,
  type FlatSubpath,
} from "../src/renderers/webgl/triangulate";

function square(x: number, y: number, size: number): FlatSubpath {
  return {
    closed: true,
    points: [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
    ],
  };
}

function filledArea(mesh: Float32Array) {
  let area = 0;
  for (let i = 0; i < mesh.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = mesh.subarray(i, i + 6);
    area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
  }
  return area;
}

describe("WebGL chart geometry", () => {
  it("preserves the winding rule on nested and intersecting contours", () => {
    const outer = square(0, 0, 10);
    const inner = square(2, 2, 2);
    expect(filledArea(triangulateFill([outer, inner]))).toBe(100);
    expect(filledArea(triangulateFill([outer, inner], "evenodd"))).toBe(96);
    inner.points.reverse();
    expect(filledArea(triangulateFill([outer, inner]))).toBe(96);
    expect(filledArea(triangulateFill([outer, square(5, 0, 10)]))).toBe(150);
  });

  it("connects a rounded corner to both tangent points", () => {
    const points = flattenArcTo(0, 0, 10, 0, 10, 10, 2)!;
    const last = points[points.length - 1];
    expect(points[0][0]).toBeCloseTo(8);
    expect(points[0][1]).toBeCloseTo(0);
    expect(last[0]).toBeCloseTo(10);
    expect(last[1]).toBeCloseTo(2);
    expect(points.every(([x, y]) => x >= 8 - 1e-8 && y >= -1e-8)).toBe(true);
    const reverseCircle = flattenArc(0, 0, 10, 0, 2 * Math.PI, true);
    expect(Math.min(...reverseCircle.map(([x]) => x))).toBeCloseTo(-10);
    const quarter = flattenArc(0, 0, 10, 0, -Math.PI / 2, true);
    expect(quarter.every(([x, y]) => x >= 0 && y <= 0)).toBe(true);
  });

  it("extends both ends of a round stroke by its radius", () => {
    const points = strokeOutline(
      [
        [0, 0],
        [10, 0],
      ],
      false,
      2,
      "round",
      "round",
    );
    expect(Math.min(...points.map(([x]) => x))).toBeCloseTo(-2);
    expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(12);
  });
});

describe("原素材音符进场", () => {
  const renderer = new NoteRenderer({
    centerX: 0,
    centerY: 0,
    radius: 480,
    hiSpeed: 6 * HI_SPEED_CONVERSION_FACTOR,
    skin: {},
    config: { mirrorMode: "none", alwaysKeepHiSpeed: false },
  } as unknown as RenderContext);
  const chart = parseSimaiChart("&bpm=120\n1,2h[4:1],");
  it("在内圈长到原尺寸，移动到判定线，命中帧隐藏 Tap", () => {
    const note = chart.notes.find((note) => note.type === "tap")!;
    const travel = 240000 / 700;
    const at = (before: number) => renderer.calculateNotePosition(note, 0, note.timingMs - before);
    expect(at(2 * travel + 1).visible).toBe(false);
    const growing = at(1.5 * travel);
    expect(Math.hypot(growing.x, growing.y)).toBeCloseTo(120);
    expect(growing.scale).toBeGreaterThan(0);
    expect(growing.scale).toBeLessThan(1);
    const moving = at(travel / 2);
    expect(Math.hypot(moving.x, moving.y)).toBeCloseTo(300 - 3 * (700 / 150 - 1));
    expect(at(0).visible).toBe(false);
  });
  it("跨变速 Hold 持续显示直到配对尾音符的毫秒时刻", () => {
    const hold = chart.notes.find((note) => note.type === "hold-start")!;
    const tail = hold.timingMs + 2500;
    const before = renderer.calculateNotePosition(hold, 0, tail - 1, tail);
    expect(before.visible).toBe(true);
    expect(Math.hypot(before.x, before.y)).toBeCloseTo(480);
    expect(renderer.calculateNotePosition(hold, 0, tail, tail).visible).toBe(false);
  });
});
