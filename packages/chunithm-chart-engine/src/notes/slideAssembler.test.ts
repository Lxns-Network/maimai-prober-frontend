import { describe, expect, it, vi } from "vitest";
import { createSlideBandAssembler } from "./slideAssembler";
import { createBandBuffer } from "./render/bandBuffer";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import type { Pack, PackEntry } from "../assets/packFormat";
import type { NoteScore } from "./score";

vi.mock("./render/noteRenderer", () => ({
  createNoteRenderer: () => {
    const buffer = createBandBuffer(1024);
    return {
      frame: ({ bands }: { bands: { vertices: number }[] }) => ({
        draws: bands.length,
        instances: 0,
        bandVertices: bands.reduce((sum, b) => sum + b.vertices, 0),
        cpuMs: 0,
      }),
      bands: () => buffer,
      dispose() {},
    };
  },
}));
function setup(kind = 0) {
  const record = new DataView(new ArrayBuffer(356));
  record.setInt32(0x10, 2, true);
  record.setInt32(0x14, -1, true);
  record.setFloat32(8, 1000, true);
  record.setFloat32(0x38, 3000, true);
  record.setInt32(0x28, 4, true);
  record.setInt32(0x2c, 3, true);
  record.setInt32(0x70, -1, true);
  record.setInt32(0x98, kind, true);
  const joint = new DataView(new ArrayBuffer(36));
  joint.setFloat32(8, 3000, true);
  joint.setInt32(0x10, 4, true);
  joint.setInt32(0x20, 3, true);
  joint.setUint8(0x14, 1);
  const score: NoteScore = {
    records: [record],
    slideJoints: new Map([[0, [joint]]]),
    timeline: new Map(),
    scroll: new DataView(new ArrayBuffer(0)),
  };
  const manager = new DataView(new ArrayBuffer(0x3b0));
  manager.setFloat32(0x354, 0.8, true);
  manager.setFloat32(0x358, 1.5, true);
  const entries = new Map<string, PackEntry>();
  for (const name of [
    "note/band/slide/4/1",
    "note/band/slide/3/2",
    "note/band/slide/3/3",
    "note/band/slide/4/0",
  ])
    entries.set(name, {
      name,
      kind: "table",
      offset: 0,
      length: 0,
      meta: { layer: 20, initialKey: 0x8580 },
    });
  for (let id = 0; id < 400; id++) {
    const name = `note/model/${id}`;
    entries.set(name, {
      name,
      kind: "table",
      offset: 0,
      length: 0,
      meta: {
        meshes: [`mesh/${id}`],
        units: 16,
        layer: 20,
        pass: 2,
        widthBase: 1,
        initialKey: 0x8580,
        widthStepI32: 0,
      },
    });
  }
  const pack: Pack = { version: 1, engine: "chunithm", bytes: new Uint8Array(), entries };
  const writer = new TimelineWriter();
  writer.push("slide", { time: 0.5, note: 0, mode: 0 });
  writer.push("slide", { time: 1, note: 0, mode: 1 });
  writer.push("slide", { time: 3, note: 0, mode: 3 });
  const timeline = Timeline.from(
    writer.finish({
      durationSeconds: 4,
      noteCount: 1,
      defaultSpeedRow: 0,
      unsupported: [],
      appearIsPlaceholder: true,
    }),
  );
  return { score, manager, pack, timeline };
}
describe("SLIDE band assembly", () => {
  it("submits body, centre and pulse layers and respects lifecycle presence and backward queries", () => {
    const input = setup();
    const assembler = createSlideBandAssembler(input);
    const buffer = createBandBuffer(1024);
    const out: Parameters<typeof assembler.assemble>[5] = [];
    const draw = (step: number) => {
      buffer.reset();
      out.length = 0;
      input.manager.setFloat32(0x300, step * 0.5, true);
      assembler.assemble(step, step * 0.5, [0], 1, buffer, out);
      return out.map((b) => ({ profile: b.profile, vertices: b.vertices, scalar: b.scalar }));
    };
    expect(draw(59)).toEqual([]);
    expect(draw(60).map((b) => b.profile)).toEqual(["note/band/slide/4/1", "note/band/slide/3/2"]);
    const pulse = draw(180);
    expect(pulse.map((b) => b.profile)).toEqual([
      "note/band/slide/4/1",
      "note/band/slide/3/2",
      "note/band/slide/3/3",
    ]);
    expect(pulse.every((b) => b.vertices > 0)).toBe(true);
    expect(draw(360)).toEqual([]);
    expect(draw(180)).toEqual(pulse);
  });
  it("preserves vertices already written by other band families and rejects missing profiles", () => {
    const input = setup();
    const assembler = createSlideBandAssembler(input);
    const buffer = createBandBuffer(1024);
    buffer.commit(6);
    const out: Parameters<typeof assembler.assemble>[5] = [];
    assembler.assemble(60, 30, [0], 1, buffer, out);
    expect(out[0].first).toBe(6);
    (input.pack.entries as Map<string, PackEntry>).delete("note/band/slide/4/1");
    expect(() => createSlideBandAssembler(input)).toThrow(/slide\/4\/1/);
  });
  it("retains the kind with no centre layer instead of binding a substitute", () => {
    const input = setup(1);
    const assembler = createSlideBandAssembler(input);
    const buffer = createBandBuffer(1024);
    const out: Parameters<typeof assembler.assemble>[5] = [];
    assembler.assemble(60, 30, [0], 1, buffer, out);
    expect(out.map((b) => b.profile)).toEqual(["note/band/slide/4/0"]);
  });
});

it("appends SLIDE geometry through createNoteLayer instead of only drawing head markers", async () => {
  const { createNoteLayer } = await import("./noteLayer");
  const input = setup();
  const layer = createNoteLayer({
    ...input,
    gl: {} as WebGL2RenderingContext,
    speedRow: 0,
    visibilityBlockSteps: 240,
    viewProjection: new Float32Array(16),
  });
  try {
    expect(layer.frame(180).bandVertices).toBeGreaterThan(0);
  } finally {
    layer.dispose();
  }
});

it("orders each SLIDE layer by its profile's layer and initial sort key", () => {
  const input = setup();
  const assembler = createSlideBandAssembler(input);
  const buffer = createBandBuffer(1024);
  const out: Parameters<typeof assembler.assemble>[5] = [];
  input.manager.setFloat32(0x300, 90, true);
  assembler.assemble(180, 90, [0], 1, buffer, out);
  expect(out.length).toBeGreaterThan(0);
  expect(out.map((band) => band.key & 0xff00)).toEqual(out.map(() => 0x9400));
  const entry = input.pack.entries.get("note/band/slide/3/2")!;
  (input.pack.entries as Map<string, PackEntry>).set(entry.name, {
    ...entry,
    meta: { layer: 20 },
  });
  expect(() => createSlideBandAssembler(input)).toThrow(/slide\/3\/2.*initial sort key/);
});
