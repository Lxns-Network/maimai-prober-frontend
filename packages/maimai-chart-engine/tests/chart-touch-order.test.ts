import { describe, expect, it, vi } from "vitest";
import { MainRenderer } from "../src/renderers/MainRenderer";
import { TouchRenderer } from "../src/renderers/TouchRenderer";
import type { RenderContext } from "../src/renderers/BaseRenderer";
import { parseMa2Chart } from "../src/core/parser/Ma2Parser";
import { prepareTouchSourceIndices } from "../src/renderers/touchSourceIndices";
import { parseSimaiChart } from "../src/core/parser/SimaiParser";
import {
  TouchDrawOrder,
  type TouchSortNote,
  flushTouchDrawCommands,
  type TouchDrawCommand,
} from "../src/renderers/touchDrawOrder";
import fixtures from "./fixtures/touch-sorting-native.json";

describe("Touch component stacking", () => {
  it.each([false, true])("paints each DDR petal once with queued rendering %s", (queued) => {
    const gradient = { addColorStop: vi.fn() };
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      closePath() {},
      arc() {},
      fill() {},
      stroke() {},
      createLinearGradient: vi.fn<CanvasRenderingContext2D["createLinearGradient"]>(() => gradient),
    };
    const renderer = new TouchRenderer({
      ctx,
      centerX: 0,
      centerY: 0,
      radius: 300,
      hiSpeed: 6,
      baseApproachTimeMs: 6000,
      config: { mirrorMode: "none", ddrColorMode: true },
    } as unknown as RenderContext);
    const chart = parseSimaiChart("&bpm=120\nCh[4:1]");
    const note = chart.notes.find((note) => note.type === "touch-hold-start")!;
    const queue: TouchDrawCommand[] = [];
    renderer.renderTouch(note, note.timing, note.timingMs, false, queued ? queue : undefined);
    if (queued) flushTouchDrawCommands(queue);
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(4);
    expect(
      ctx.createLinearGradient.mock.calls.map(([x, y]) => [Math.sign(x), Math.sign(y)]).sort(),
    ).toEqual([
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]);
  });

  it("retains distinct source indices through main renderer preparation", () => {
    const chart = parseSimaiChart(
      "&bpm=120\nCf/B2h[4:1]/B3h[4:1]/E3h[4:1]/B6h[4:1]/B7h[4:1]/E7h[4:1]",
    );
    const renderer: MainRenderer = Object.create(MainRenderer.prototype);
    Object.assign(renderer, { slideRenderer: { invalidateTrackLayer() {} } });
    const prepared = renderer["prepareRenderNotes"](chart.notes);
    expect(
      prepared.touches
        .map((note) => ({
          position: note.position,
          index: prepared.noteMeta.get(note)?.sourceNoteIndex,
        }))
        .sort((a, b) => a.index! - b.index!)
        .map(({ position, index }) => [position, index]),
    ).toEqual([
      ["C", 0],
      ["B2", 1],
      ["B3", 2],
      ["E3", 3],
      ["B6", 4],
      ["B7", 5],
      ["E7", 6],
    ]);
    expect(renderer["getNoteMeta"](new WeakMap(), chart.notes[0]).sourceNoteIndex).toBeUndefined();
  });
  it.each(fixtures.groupCases)("matches captured group ranks: $name", ({ notes, expected }) => {
    const order = new TouchDrawOrder();
    expect(order.resolve(notes as TouchSortNote[])).toEqual(expected);
    expect(order.resolve([...notes].reverse() as TouchSortNote[])).toEqual(expected);
  });

  it("reuses ranks with fresh drawing callbacks and restores them after a seek", () => {
    const notes = fixtures.groupCases[0].notes as TouchSortNote[];
    const order = new TouchDrawOrder();
    const first = order.resolve(notes);
    const shifted = notes.map((note) => ({ ...note, registeredAtMs: note.registeredAtMs + 500 }));
    expect(order.resolve(shifted)).toBe(first);
    const before = vi.fn();
    const after = vi.fn();
    flushTouchDrawCommands(
      notes.map((note) => ({ ...note, draw: before })),
      order,
    );
    flushTouchDrawCommands(
      notes.map((note) => ({ ...note, draw: after })),
      order,
    );
    expect(before).toHaveBeenCalledTimes(first.length);
    expect(after.mock.calls).toEqual(before.mock.calls);
    expect(order.resolve(notes.slice(1))).not.toBe(first);
    expect(order.resolve([])).toEqual([]);
    expect(order.resolve(notes)).toEqual(first);
  });

  it("invalidates cached ranks when same-sensor registration order changes", () => {
    const order = new TouchDrawOrder();
    const initial = fixtures.groupCases.find((row) => row.name === "same-launcher")!;
    const updated = fixtures.groupCases.find((row) => row.name === "registration-order")!;
    const first = order.resolve(initial.notes as TouchSortNote[]);
    expect(order.resolve(updated.notes as TouchSortNote[])).not.toBe(first);
    expect(order.resolve(updated.notes as TouchSortNote[])).toEqual(updated.expected);
  });

  it.each([
    ["none", "B2"],
    ["horizontal", "B7"],
    ["vertical", "B3"],
    ["rotate180", "B6"],
  ] as const)("enqueues the mirrored sensor with %s", (mirrorMode, position) => {
    const renderer = new TouchRenderer({
      ctx: {},
      centerX: 0,
      centerY: 0,
      radius: 300,
      hiSpeed: 6,
      baseApproachTimeMs: 6000,
      config: { mirrorMode, ddrColorMode: false, alwaysKeepHiSpeed: true, playbackSpeed: 2 },
    } as RenderContext);
    const note = parseSimaiChart("&bpm=120\nB2h[4:1]").notes.find(
      (note) => note.type === "touch-hold-start",
    )!;
    note.hiSpeed = 0.5;
    const queue: TouchDrawCommand[] = [];
    const entryMs = note.timingMs - renderer.getTouchApproachTimeMs(note);
    renderer.renderTouch(note, 0, entryMs - 1, false, queue, 7);
    expect(queue).toHaveLength(0);
    renderer.renderTouch(note, 0, entryMs, false, queue, 7);
    expect(queue).toMatchObject([{ position, sourceIndex: 7, registeredAtMs: entryMs }]);
    expect(entryMs).toBe(note.timingMs - 3600);
  });

  it("uses the complete chart for Simai indices, including non-Touch notes", () => {
    const chart = parseSimaiChart("&bpm=120\n1h[4:1]/Cf/B2h[4:1]/2/B3h[4:1]/E3h[4:1]");
    const indices = prepareTouchSourceIndices(chart.notes);
    expect(
      chart.notes
        .filter((note) => note.type === "touch-hold-start")
        .map((note) => [note.position, indices.get(note)]),
    ).toEqual([
      ["B2", 2],
      ["B3", 4],
      ["E3", 5],
    ]);
  });
  it("preserves simultaneous Simai Touch Hold token order", () => {
    const chart = parseSimaiChart(
      "&bpm=120\nCf/B2h[4:1]/B3h[4:1]/E3h[4:1]/B6h[4:1]/B7h[4:1]/E7h[4:1]",
    );
    const touches = chart.notes.filter((note) => note.type === "touch-hold-start");
    const indices = prepareTouchSourceIndices(chart.notes);
    expect(
      touches
        .slice(0, 3)
        .sort((a, b) => indices.get(a)! - indices.get(b)!)
        .map((note) => note.position),
    ).toEqual(["B2", "B3", "E3"]);
  });

  it("preserves records across synthetic tails and merged slide paths", () => {
    const chart = parseMa2Chart(
      [
        "RESOLUTION 384",
        "BPM_DEF 120",
        "NMTHO 0 0 0 384 B 0",
        "NMSTR 0 0 0",
        "NMSI_ 0 0 0 96 96 2",
        "NMTHO 0 0 1 384 B 0",
        "NMTTP 0 0 2 B 0",
      ].join("\n"),
      4,
    );
    expect(
      chart.notes
        .filter((note) => note.type === "touch-hold-start")
        .map((note) => note.sourceNoteIndex),
    ).toEqual([0, 3]);
    expect(chart.notes.find((note) => note.type === "touch")?.sourceNoteIndex).toBe(4);
  });
});
