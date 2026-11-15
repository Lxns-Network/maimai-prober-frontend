class Bytes {
  values: number[] = [];
  u8(value: number) {
    this.values.push(value & 255);
  }
  u16(value: number) {
    this.u8(value);
    this.u8(value >>> 8);
  }
  u32(value: number) {
    this.u16(value);
    this.u16(value >>> 16);
  }
  raw(values: Uint8Array) {
    this.values.push(...values);
  }
  string(value: string, wide = false) {
    const bytes = new TextEncoder().encode(value);
    if (wide) this.u16(bytes.length + 1);
    else this.u8(bytes.length + 1);
    this.raw(bytes);
    this.u8(0);
  }
  bytes() {
    return Uint8Array.from(this.values);
  }
}

function metadata(frameCount: number, tracks: number) {
  const body = new Bytes();
  body.u8(7);
  body.string("uva::AnimDatabase", true);
  body.u8(0);
  body.string("fixture");
  body.u8(0);
  body.string("yabukita::Object");
  body.raw(Uint8Array.of(1, 0, 0));
  body.u8(0);
  body.string("uva::AnimDatabase");
  body.raw(Uint8Array.of(1, 1, 0));
  body.string("_pSceneProperty");
  body.u8(1);
  body.u16(2);
  body.u8(0);
  body.string("uva::SceneProperty");
  body.raw(Uint8Array.of(1, 1, 0));
  for (const name of ["_magicWord", "_frameNumber", "_uvOffsetAnimationNumber"]) {
    body.string(name);
    body.u8(1);
    body.u16(4);
  }
  body.u8(0);
  body.u8(0);
  body.u16(0);
  body.u16(2);
  body.u16(2);
  body.u32(2);
  body.u16(10002);
  body.u16(3);
  body.u32(12);
  body.u32(0x30414d48);
  body.u32(frameCount);
  body.u32(tracks);
  const header = new Bytes();
  header.raw(new TextEncoder().encode("YABX"));
  header.u32(1);
  header.u32(body.values.length);
  header.u32(0);
  header.raw(body.bytes());
  return header.bytes();
}

interface FixtureKey {
  frame: number;
  value: number;
  tangent: number;
  mode: number;
}

/** A compact cubic key: an s16 value over 32767 and a frame packed with its mode in the top two bits. */
export interface CompactFixtureKey {
  frame: number;
  value: number;
  tangent: number;
  mode: number;
}

export function uvAnimationFixture(
  options: {
    frameCount?: number;
    metadataTracks?: number;
    /** Names in texture, channel, material order for each of the two tracks. */
    names?: readonly [string, string, string, string, string, string];
    keys?: readonly FixtureKey[];
    /** Curve type of track 0's animated component; 0 reads the float pool. */
    curveType?: number;
    /** Emit the compact layout: compact cubic keys on track 0 and per-frame samples on track 1. */
    compact?: {
      keys: readonly CompactFixtureKey[];
      samples: readonly number[];
      sampleCurveType?: number;
      withFloatPool?: boolean;
    };
  } = {},
) {
  const names = new TextEncoder().encode(
    (options.names ?? ["image", "UV0", "effect", "image", "Others", "body"]).join("\0") + "\0",
  );
  const tracks = new Uint8Array(4 + 2 * 68);
  const tv = new DataView(tracks.buffer);
  tv.setUint32(0, 2, true);
  for (let i = 0; i < 2; i++) {
    const at = 4 + i * 68;
    tv.setFloat32(at + 52, i ? 7 : -0, true);
    tv.setFloat32(at + 56, i ? 8 : 1, true);
    tv.setFloat32(at + 60, 99, true);
    tv.setFloat32(at + 64, 88, true);
  }
  const keys = options.keys ?? [
    { frame: 0, value: 2, tangent: 0.5, mode: 0 },
    { frame: 8, value: 4, tangent: -0.25, mode: 2 },
  ];
  tv.setUint32(4 + 12, options.curveType ?? (options.compact ? 1 : 0), true);
  tv.setUint32(4 + 12 + 8, options.compact ? options.compact.keys.length : keys.length, true);
  tv.setUint32(4 + 48, 0x4000, true);
  if (options.compact) {
    const second = 4 + 68;
    tv.setUint32(second, options.compact.sampleCurveType ?? 3, true);
    tv.setUint32(second + 8, options.compact.samples.length, true);
    tv.setUint32(second + 48, 0x2000, true);
  }
  const pool = new Uint8Array(4 + keys.length * 12);
  const pv = new DataView(pool.buffer);
  pv.setUint32(0, keys.length, true);
  keys.forEach((key, i) => {
    const at = 4 + i * 12;
    pv.setFloat32(at, key.value, true);
    pv.setFloat32(at + 4, key.tangent, true);
    pv.setUint16(at + 8, key.frame, true);
    pv.setUint16(at + 10, key.mode, true);
  });
  const version = Uint8Array.of(0x57, 0x2c, 0x33, 0x01);
  const pools: { kind: number; bytes: Uint8Array }[] = [{ kind: 2, bytes: pool }];
  if (options.compact) {
    const { keys: compactKeys, samples, withFloatPool } = options.compact;
    const compact = new Uint8Array(4 + compactKeys.length * 8);
    const cv = new DataView(compact.buffer);
    cv.setUint32(0, compactKeys.length, true);
    compactKeys.forEach((key, i) => {
      const at = 4 + i * 8;
      cv.setFloat32(at, key.tangent, true);
      cv.setInt16(at + 4, key.value, true);
      cv.setUint16(at + 6, (key.mode << 14) | key.frame, true);
    });
    const sampled = new Uint8Array(4 + samples.length * 2);
    const sv = new DataView(sampled.buffer);
    sv.setUint32(0, samples.length, true);
    samples.forEach((value, i) => sv.setInt16(4 + i * 2, value, true));
    pools.splice(
      0,
      1,
      ...(withFloatPool ? [{ kind: 2, bytes: pool }] : []),
      { kind: 3, bytes: compact },
      { kind: 5, bytes: sampled },
    );
  }
  const chunks = [
    { kind: 6, bytes: names },
    ...pools,
    { kind: 0, bytes: metadata(options.frameCount ?? 9, options.metadataTracks ?? 2) },
    { kind: 10, bytes: version },
    { kind: 9, bytes: tracks },
  ];
  let offset = 0x80 + chunks.length * 0x100 + 32;
  const positions = new Map<number, number>();
  for (const chunk of chunks) {
    positions.set(chunk.kind, offset);
    offset += chunk.bytes.length + 17;
  }
  const bytes = new Uint8Array(offset);
  const v = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("CVU\0"));
  v.setUint32(4, chunks.length, true);
  chunks.forEach((chunk, i) => {
    const at = 0x80 + i * 0x100;
    v.setUint32(at, chunk.kind, true);
    v.setUint32(at + 4, i, true);
    v.setUint32(at + 8, chunk.bytes.length, true);
    v.setUint32(at + 12, positions.get(chunk.kind)!, true);
    bytes.set(chunk.bytes, positions.get(chunk.kind)!);
  });
  return { bytes, positions, view: v };
}
