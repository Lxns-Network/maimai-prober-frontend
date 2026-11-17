import { describe, expect, it } from "vitest";
import type { BoundScore } from "../chart/bind/bindScore";
import { noteScoreOf } from "./score";

const event = (value: number): DataView => {
  const view = new DataView(new ArrayBuffer(32));
  view.setUint32(0, value, true);
  return view;
};

describe("noteScoreOf", () => {
  const bound = {
    records: [new DataView(new ArrayBuffer(0x164))],
    parsed: {
      canonical: { vectors: {} },
      run: {
        lines: [{ items: [] }, { items: [] }, { items: [] }, { items: [] }],
        timeline: {
          dcm: { items: [event(1), event(2)] },
          map: new Map([
            [5, { items: [event(7)] }],
            [6, { items: [] }],
          ]),
        },
      },
    },
  } as unknown as BoundScore;

  it("lays the scroll rows out as one contiguous table", () => {
    const { scroll } = noteScoreOf(bound);
    expect(scroll.byteLength).toBe(64);
    expect([scroll.getUint32(0, true), scroll.getUint32(32, true)]).toEqual([1, 2]);
  });

  it("keeps only the timeline keys that have events", () => {
    const { timeline } = noteScoreOf(bound);
    expect([...timeline.keys()]).toEqual([5]);
    expect(timeline.get(5)!.getUint32(0, true)).toBe(7);
  });

  it("carries the bound records through unchanged", () => {
    expect(noteScoreOf(bound).records).toBe(bound.records);
  });

  describe("slide joints", () => {
    const hexOf = (bytes: number[], undefinedAt: number[] = []) =>
      bytes
        .map((b, i) => (undefinedAt.includes(i) ? "--" : b.toString(16).padStart(2, "0")))
        .join("");
    const joint = (fill: number, undefinedAt: number[] = []) =>
      hexOf(
        Array.from({ length: 36 }, (_, i) => (i === 0 ? fill : 0)),
        undefinedAt,
      );
    const recordOfType = (type: number) => {
      const view = new DataView(new ArrayBuffer(0x164));
      view.setInt32(0x10, type, true);
      return view;
    };
    const slideBound = {
      records: [recordOfType(0), recordOfType(2)],
      parsed: {
        canonical: {
          vectors: {
            "0x15c": {
              items: [
                { vectors: {}, hex: "" },
                { vectors: { "0x40": { items: [joint(1), joint(2, [1, 2])] } }, hex: "" },
              ],
            },
          },
        },
        run: {
          lines: [{ items: [] }, { items: [] }, { items: [] }, { items: [] }],
          timeline: { dcm: { items: [] }, map: new Map() },
        },
      },
    } as unknown as BoundScore;

    it("reads each slide record's joints as 36-byte views, with undefined bytes as zero", () => {
      const joints = noteScoreOf(slideBound).slideJoints!;
      expect([...joints.keys()]).toEqual([1]);
      const [first, second] = joints.get(1)!;
      expect([first.byteLength, first.getUint8(0), second.getUint8(0)]).toEqual([36, 1, 2]);
      expect([second.getUint8(1), second.getUint8(2)]).toEqual([0, 0]);
    });

    it("rejects a joint that is not 36 bytes", () => {
      const broken = structuredClone(slideBound) as unknown as {
        parsed: {
          canonical: {
            vectors: Record<string, { items: { vectors: Record<string, { items: string[] }> }[] }>;
          };
        };
      };
      broken.parsed.canonical.vectors["0x15c"].items[1].vectors["0x40"].items = ["00"];
      expect(() => noteScoreOf(broken as unknown as BoundScore)).toThrow(/36 bytes/);
    });
  });

  describe("AIR HOLD elements", () => {
    const record = (secondary: number) => {
      const view = new DataView(new ArrayBuffer(0x164));
      view.setInt32(0x14, secondary, true);
      return view;
    };
    const joint = (fill: number) =>
      Array.from({ length: 36 }, (_, i) => (i === 0 ? fill : 0).toString(16).padStart(2, "0")).join(
        "",
      );
    const holdBound = (notes: unknown[]) =>
      ({
        records: notes.map((_, i) => record(i === 2 ? 3 : 5)),
        parsed: {
          canonical: { vectors: { "0x15c": { items: notes } } },
          run: {
            lines: [{ items: [] }, { items: [] }, { items: [] }, { items: [] }],
            timeline: { dcm: { items: [] }, map: new Map() },
          },
        },
      }) as unknown as BoundScore;

    it("keeps each AIR HOLD record's element joints, including none", () => {
      const holds = noteScoreOf(
        holdBound([
          { vectors: { "0x50": { items: [] } }, hex: "" },
          { vectors: { "0x50": { items: [joint(4), joint(9)] } }, hex: "" },
          { vectors: {}, hex: "" },
        ]),
      ).airHolds!;
      expect([...holds.keys()]).toEqual([0, 1]);
      expect(holds.get(0)).toEqual([]);
      expect(holds.get(1)!.map((view) => [view.byteLength, view.getUint8(0)])).toEqual([
        [36, 4],
        [36, 9],
      ]);
    });

    it("rejects an AIR HOLD without an element vector", () => {
      expect(() => noteScoreOf(holdBound([{ vectors: {}, hex: "" }]))).toThrow(/element vector/);
    });
  });
});
