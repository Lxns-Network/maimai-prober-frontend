import { describe, expect, it } from "vitest";
import { readUvAnimation, sampleUvTrack } from "./uvAnimation";
import { uvAnimationFixture as fixture } from "./uvAnimation.testFixture";
const bits = (values: Float32Array) => [
  ...new Uint32Array(values.buffer, values.byteOffset, values.length),
];
const fromBits = (word: number) => new Float32Array(Uint32Array.of(word).buffer)[0];
describe("bounded UV resource", () => {
  it("reads relocated named tracks and samples the cubic into caller storage", () => {
    const { bytes } = fixture();
    const padded = new Uint8Array(bytes.length + 11);
    padded.set(bytes, 7);
    const animation = readUvAnimation(padded.subarray(7, 7 + bytes.length));
    expect(animation.frameCount).toBe(9);
    expect(animation.tracks.map((t) => [t.textureName, t.channel, t.materialName])).toEqual([
      ["image", "UV0", "effect"],
      ["image", "Others", "body"],
    ]);
    const output = new Float32Array(6).fill(-99);
    sampleUvTrack(animation.tracks[0], 4, output);
    expect([...output]).toEqual([-0, 3.75, 1, 1, -99, -99]);
    sampleUvTrack(animation.tracks[0], 8, output);
    expect([...output].slice(0, 4)).toEqual([-0, 4, 1, 1]);
    sampleUvTrack(animation.tracks[1], 0, output);
    expect([...output].slice(0, 4)).toEqual([7, 8, 1, 1]);
  });
  it.each(["UV1", "Specular", "Normal", "Incandescence"])(
    "accepts the %s channel only in the shared Stage layout",
    (channel) => {
      const { bytes } = fixture({ names: ["image", "UV0", "effect", "image", channel, "body"] });
      expect(() => readUvAnimation(bytes)).toThrow(/unsupported track channel/);
      expect(readUvAnimation(bytes, true).tracks[1].channel).toBe(channel);
    },
  );
  it("rejects unknown channels even in the shared Stage layout", () => {
    const { bytes } = fixture({ names: ["image", "UV0", "effect", "image", "unknown", "body"] });
    expect(() => readUvAnimation(bytes, true)).toThrow(/unsupported track channel/);
  });
  it("matches fixed cubic sample bits at keys and on both sides of segment boundaries", () => {
    const { bytes } = fixture({
      frameCount: 51,
      keys: [
        { frame: 0, value: 1, tangent: 0.009999990463256836, mode: 0 },
        { frame: 6, value: 1.1200000047683716, tangent: 0.019999980926513672, mode: 0 },
        { frame: 49, value: 1.9800000190734863, tangent: 0.019999980926513672, mode: 0 },
        { frame: 50, value: 2, tangent: 0.009999990463256836, mode: 2 },
      ],
    });
    const track = readUvAnimation(bytes).tracks[0];
    const output = new Float32Array(4);
    for (const [frameBits, valueBits] of [
      [0, 1065353216],
      [1065353216, 1065462734],
      [1077936128, 1065793618],
      [1086324715, 1066359847],
      [1086324736, 1066359849],
      [1086324757, 1066359851],
      [1111752704, 1073574052],
      [1112014848, 1073741824],
    ]) {
      sampleUvTrack(track, fromBits(frameBits), output);
      expect(bits(output)).toEqual([0x80000000, valueBits, 1065353216, 1065353216]);
    }
  });
  it("owns decoded values rather than borrowing mutable input bytes", () => {
    const { bytes } = fixture();
    const animation = readUvAnimation(bytes);
    bytes.fill(0);
    const output = new Float32Array(4);
    sampleUvTrack(animation.tracks[0], 4, output);
    expect([...output]).toEqual([-0, 3.75, 1, 1]);
  });
  it.each([-0.000001, 8.00000001, NaN, Infinity, -Infinity])(
    "rejects out-of-range frame %s before rounding",
    (frame) => {
      const track = readUvAnimation(fixture().bytes).tracks[0];
      expect(() => sampleUvTrack(track, frame, new Float32Array(4))).toThrow(RangeError);
    },
  );
  it("rejects an undersized output", () => {
    expect(() =>
      sampleUvTrack(readUvAnimation(fixture().bytes).tracks[0], 0, new Float32Array(3)),
    ).toThrow(RangeError);
  });
  it.each([0xff, 0x80])("rejects non-UTF8 magic byte %i as a malformed resource", (value) => {
    const data = fixture();
    data.bytes[0] = value;
    expect(() => readUvAnimation(data.bytes)).toThrow(RangeError);
  });
  it.each([
    [
      "magic",
      (b: ReturnType<typeof fixture>) => {
        b.bytes[0] = 0;
      },
    ],
    [
      "directory count",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(4, 10000, true);
      },
    ],
    [
      "duplicate kind",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(0x180, 6, true);
      },
    ],
    [
      "directory index",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(0x84, 1, true);
      },
    ],
    [
      "overlap",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(0x18c, b.positions.get(6)!, true);
      },
    ],
    [
      "header overlap",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(0x8c, 0, true);
      },
    ],
    [
      "version",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(b.positions.get(10)!, 0, true);
      },
    ],
    [
      "pool size",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(b.positions.get(2)!, 3, true);
      },
    ],
    [
      "track size",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(b.positions.get(9)!, 3, true);
      },
    ],
    [
      "name terminator",
      (b: ReturnType<typeof fixture>) => {
        b.bytes[b.positions.get(6)! + 34] = 1;
      },
    ],
    [
      "curve kind",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(b.positions.get(9)! + 4 + 12, 1, true);
      },
    ],
    [
      "curve range",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint32(b.positions.get(9)! + 4 + 12 + 4, 2, true);
      },
    ],
    [
      "key mode",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint16(b.positions.get(2)! + 4 + 10, 1, true);
      },
    ],
    [
      "key order",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint16(b.positions.get(2)! + 4 + 12 + 8, 0, true);
      },
    ],
    [
      "first key",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint16(b.positions.get(2)! + 4 + 8, 1, true);
      },
    ],
    [
      "last key",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint16(b.positions.get(2)! + 4 + 12 + 8, 7, true);
      },
    ],
    [
      "terminal mode",
      (b: ReturnType<typeof fixture>) => {
        b.view.setUint16(b.positions.get(2)! + 4 + 12 + 10, 0, true);
      },
    ],
    [
      "key value",
      (b: ReturnType<typeof fixture>) => {
        b.view.setFloat32(b.positions.get(2)! + 4, NaN, true);
      },
    ],
    [
      "static value",
      (b: ReturnType<typeof fixture>) => {
        b.view.setFloat32(b.positions.get(9)! + 4 + 52, Infinity, true);
      },
    ],
  ] as const)("rejects malformed %s", (_name, mutate) => {
    const data = fixture();
    mutate(data);
    expect(() => readUvAnimation(data.bytes)).toThrow(RangeError);
  });
  it.each([0, 65537])("rejects invalid metadata frame count %i", (frameCount) => {
    expect(() => readUvAnimation(fixture({ frameCount }).bytes)).toThrow(RangeError);
  });
  it("rejects metadata and track table disagreement", () => {
    expect(() => readUvAnimation(fixture({ metadataTracks: 1 }).bytes)).toThrow(RangeError);
  });
  it("returns recursively immutable decoded tracks", () => {
    const animation = readUvAnimation(fixture().bytes);
    expect(Object.isFrozen(animation)).toBe(true);
    expect(Object.isFrozen(animation.tracks)).toBe(true);
    expect(Object.isFrozen(animation.tracks[0].curves[1]!.keys[0])).toBe(true);
  });
  it("accepts a final float mode 0 only in the bounded shared Stage layout", () => {
    const data = fixture({
      keys: [
        { frame: 0, value: 2, tangent: 0, mode: 2 },
        { frame: 4, value: 3, tangent: 0, mode: 2 },
        { frame: 8, value: 4, tangent: 0.5, mode: 0 },
      ],
    });
    expect(() => readUvAnimation(data.bytes)).toThrow(/curve keys must span/);
    const track = readUvAnimation(data.bytes, true).tracks[0];
    const output = new Float32Array(4);
    for (const [frame, expected] of [
      [0, 2],
      [3.999, 2],
      [4, 3],
      [7.999, 3],
      [8, 4],
    ]) {
      sampleUvTrack(track, frame, output);
      expect(output[1]).toBe(expected);
    }
    const single = fixture({
      frameCount: 1,
      keys: [{ frame: 0, value: 4, tangent: 0, mode: 0 }],
    });
    expect(() => readUvAnimation(single.bytes, true)).toThrow(/curve keys must span/);
  });
  it("rejects truncated directory and payloads", () => {
    const { bytes } = fixture();
    for (const length of [0, 7, 0x580 - 1, bytes.length - 30])
      expect(() => readUvAnimation(bytes.subarray(0, length))).toThrow(RangeError);
  });
});
const COMPACT_KEYS = [
  { frame: 0, value: 16384, tangent: 0.5, mode: 0 },
  { frame: 8, value: -32767, tangent: -0.25, mode: 2 },
];
const SAMPLES = [0, 4096, 8191, -12287, 16383, 20479, -24575, 28671, 32767];
const compact = (overrides: Partial<NonNullable<Parameters<typeof fixture>[0]>["compact"]> = {}) =>
  fixture({ compact: { keys: COMPACT_KEYS, samples: SAMPLES, ...overrides } });
describe("compact and per-frame UV resources", () => {
  it("reads compact cubic keys and one linear sample per frame", () => {
    const animation = readUvAnimation(compact().bytes);
    const cubic = animation.tracks[0].curves[1]!;
    expect(cubic.kind).toBe(0);
    expect(cubic.keys).toEqual([
      { frame: 0, mode: 0, value: Math.fround(16384 / 32767), tangent: 0.5 },
      { frame: 8, mode: 2, value: -1, tangent: -0.25 },
    ]);
    const sampled = animation.tracks[1].curves[0]!;
    expect(sampled.kind).toBe(3);
    expect(sampled.keys).toEqual(
      SAMPLES.map((value, frame) => ({
        frame,
        mode: frame === SAMPLES.length - 1 ? 2 : 3,
        value: Math.fround(value / 32767),
        tangent: 0,
      })),
    );
  });
  it("rejects compact keys and sample runs it cannot represent", () => {
    for (const mode of [1, 3])
      expect(() =>
        readUvAnimation(compact({ keys: [COMPACT_KEYS[0], { ...COMPACT_KEYS[1], mode }] }).bytes),
      ).toThrow(RangeError);
    expect(() =>
      readUvAnimation(compact({ keys: [COMPACT_KEYS[0], { ...COMPACT_KEYS[1], frame: 9 }] }).bytes),
    ).toThrow(RangeError);
    expect(() => readUvAnimation(compact({ samples: SAMPLES.slice(1) }).bytes)).toThrow(RangeError);
    expect(() => readUvAnimation(compact({ sampleCurveType: 0 }).bytes)).toThrow(RangeError);
  });
  it("accepts a final compact mode 0 only in the bounded shared Stage layout", () => {
    const data = compact({ keys: [COMPACT_KEYS[0], { ...COMPACT_KEYS[1], mode: 0 }] });
    expect(() => readUvAnimation(data.bytes)).toThrow(/curve keys must span/);
    const animation = readUvAnimation(data.bytes, true);
    const output = new Float32Array(4);
    sampleUvTrack(animation.tracks[0], 8, output);
    expect(output[1]).toBe(-1);
    const single = fixture({
      frameCount: 1,
      compact: { keys: [{ ...COMPACT_KEYS[0], mode: 0 }], samples: [0] },
    });
    expect(() => readUvAnimation(single.bytes, true)).toThrow(/curve keys must span/);
  });
  it("rejects a curve whose pool its resource does not carry, and mixed pool layouts", () => {
    expect(() => readUvAnimation(fixture({ curveType: 1 }).bytes)).toThrow(RangeError);
    expect(() => readUvAnimation(fixture({ curveType: 3 }).bytes)).toThrow(RangeError);
    expect(() => readUvAnimation(compact({ withFloatPool: true }).bytes)).toThrow(RangeError);
  });
});
