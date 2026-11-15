import { describe, expect, it } from "vitest";
import { assembleHud, createHudGeometry, prepareHudChart, type HudScene } from "./hudScene";
import {
  HUD_NO_PAGE,
  layoutHudTagLine,
  layoutHudTextLine,
  type HudFont,
  type HudTextProfile,
} from "./textLayout";

const profile: HudTextProfile = {
  flags: 32,
  width: 100,
  height: 16,
  pivotX: 0,
  pivotY: 0,
  scaleX: 1,
  scaleY: 1,
};

function fontOf(advance = 12): HudFont {
  return {
    pixelSize: 16,
    ascent: 12,
    descent: 4,
    pages: [
      { width: 64, height: 64 },
      { width: 64, height: 64 },
    ],
    codepoints: Uint32Array.of(32, 65, 66),
    originX: Int16Array.of(0, 0, 0),
    originY: Int16Array.of(0, 0, 0),
    advance: Int16Array.of(4, advance, advance),
    sx: Uint16Array.of(0, 2, 2),
    sy: Uint16Array.of(0, 2, 2),
    sw: Uint16Array.of(0, 8, 8),
    sh: Uint16Array.of(0, 8, 8),
    page: Uint8Array.of(HUD_NO_PAGE, 0, 1),
  };
}

describe("HUD font pages", () => {
  it("lays out disjoint glyphs across repeated page changes", () => {
    const result = layoutHudTextLine(profile, fontOf(), "AB A", true);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.glyphs.map((glyph) => glyph.page)).toEqual([1, 0, 0]);
    expect(result.glyphs.map((glyph) => glyph.vertices[3])).toEqual([11, -1, 27]);
    expect(layoutHudTagLine(profile, fontOf(), "ABA", 12).status).toBe("ready");
  });

  it("assembles a title whose final glyphs are on another font page", () => {
    const colors = {
      multiply: Array(6).fill([255, 255, 255, 255]),
      add: Array(6).fill([0, 0, 0, 0]),
    };
    const slot = {
      type: "text" as const,
      value: "title" as const,
      registered: true,
      font: 0,
      profile,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      materials: [0, 1],
      fallback: colors,
      ...colors,
    };
    const scene = {
      meta: { slots: [slot], gaugeLimit: 12000 },
      fonts: [fontOf()],
      capacity: 3,
    } as unknown as HudScene;
    const chart = {
      title: "AABB",
      artist: "",
      difficulty: "MASTER",
      rawLevel: 15,
      levelDecimal: 0,
      exType: 0,
      jacket: true,
      speedRow: 0,
    };
    const state = prepareHudChart(scene, chart);
    const geometry = createHudGeometry({ ...scene, capacity: 4 });
    assembleHud(scene, state, { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] }, geometry);
    expect(state.missing).toEqual([]);
    expect(geometry.count).toBe(4);
    expect([...geometry.materials.subarray(0, geometry.count)]).toEqual([1, 1, 0, 0]);
  });

  it("batches overlapping glyphs by page without dropping the title", () => {
    const text = layoutHudTextLine(profile, fontOf(4), "ABA", true);
    expect(text.status).toBe("ready");
    if (text.status !== "ready") return;
    expect(text.glyphs.map((glyph) => glyph.page)).toEqual([1, 0, 0]);
    expect(text.glyphs.map((glyph) => glyph.vertices[3])).toEqual([3, -1, 7]);
    const tag = layoutHudTagLine(profile, fontOf(4), "ABA", 4);
    expect(tag.status).toBe("ready");
    if (tag.status !== "ready") return;
    expect(tag.glyphs.map((glyph) => glyph.page)).toEqual([1, 0, 0]);
    const fitted = layoutHudTextLine(profile, fontOf(4), "ABA", false);
    expect(fitted.status).toBe("ready");
    if (fitted.status !== "ready") return;
    expect(fitted.glyphs.map((glyph) => glyph.page)).toEqual([0, 1, 0]);

    const colors = {
      multiply: Array(6).fill([255, 255, 255, 255]),
      add: Array(6).fill([0, 0, 0, 0]),
    };
    const slot = {
      type: "text" as const,
      value: "title" as const,
      registered: true,
      font: 0,
      profile,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      materials: [0, 1],
      fallback: colors,
      ...colors,
    };
    const scene = {
      meta: { slots: [slot], gaugeLimit: 12000 },
      fonts: [fontOf()],
      capacity: 3,
    } as unknown as HudScene;
    const chart = {
      title: "ABA",
      artist: "",
      difficulty: "MASTER",
      rawLevel: 15,
      levelDecimal: 0,
      exType: 0,
      jacket: true,
      speedRow: 0,
    };
    const state = prepareHudChart(scene, chart);
    const geometry = createHudGeometry(scene);
    assembleHud(scene, state, { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] }, geometry);
    expect([...geometry.materials.subarray(0, geometry.count)]).toEqual([1, 0, 0]);
    expect(prepareHudChart(scene, { ...chart, title: "C" }).missing).toEqual([
      "title: missing glyph U+43",
    ]);
    const overlapping = { ...scene, fonts: [fontOf(4)] };
    const overlappingState = prepareHudChart(overlapping, chart);
    const overlappingGeometry = createHudGeometry(overlapping);
    assembleHud(
      overlapping,
      overlappingState,
      { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] },
      overlappingGeometry,
    );
    expect(overlappingState.missing).toEqual([]);
    expect([...overlappingGeometry.materials.subarray(0, overlappingGeometry.count)]).toEqual([
      1, 0, 0,
    ]);
    const narrowSlot = { ...slot, profile: { ...profile, width: 15 } };
    const narrow = { ...overlapping, meta: { ...overlapping.meta, slots: [narrowSlot] } };
    const narrowState = prepareHudChart(narrow, chart);
    const narrowGeometry = createHudGeometry(narrow);
    assembleHud(
      narrow,
      narrowState,
      { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] },
      narrowGeometry,
    );
    expect(narrowState.texts.get(narrowSlot)?.registered).toBe(false);
    expect(narrowState.missing).toEqual([]);
    expect([...narrowGeometry.materials.subarray(0, narrowGeometry.count)]).toEqual([0, 1, 0]);
  });
});
