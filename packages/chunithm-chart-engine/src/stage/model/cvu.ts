const MAGIC = 0x00555643;
const VERSION = 0x1332c57;
const CHUNK_TABLE = 0x80;
const CHUNK_STRIDE = 0x100;
const TRACK_BYTES = 172;
const DESCRIPTORS = 11;
const FLAG_POSITION = 1;
const FLAG_QUATERNION = 2;
const FLAG_SCALE = 4;
const FLAG_ACTIVE = 0x20000;

const CHUNK_SCENE = 0;
const CHUNK_TRACKS = 1;
const CHUNK_FLOAT_KEYS = 2;
const CHUNK_PACKED_KEYS = 3;
const CHUNK_FLOAT_SAMPLES = 4;
const CHUNK_PACKED_SAMPLES = 5;
const CHUNK_NAMES = 6;
const CHUNK_VERSION = 10;

/** Which components of a track are animated: bit flags of the track record. */
export const TRACK_FLAGS = {
  position: FLAG_POSITION,
  quaternion: FLAG_QUATERNION,
  scale: FLAG_SCALE,
  active: FLAG_ACTIVE,
} as const;

/** One curve of a track: a key pool range, or none. */
export interface CvuDescriptor {
  readonly kind: number;
  readonly start: number;
  readonly count: number;
  readonly active: boolean;
}

export interface CvuTrack {
  readonly name: string | null;
  readonly flags: number;
  readonly descriptors: readonly CvuDescriptor[];
  readonly position: readonly number[];
  readonly scale: readonly number[];
  readonly quaternion: readonly number[];
}

/** A decoded animation container: its frame count, track table and curve pools. */
export interface Cvu {
  readonly frameCount: number;
  readonly tracks: readonly CvuTrack[];
  readonly floatKeys: Uint32Array;
  readonly packedKeys: Uint32Array;
  readonly floatSamples: Float32Array;
  readonly packedSamples: Int16Array;
}

function fail(message: string): never {
  throw new RangeError(`Stage animation: ${message}`);
}

/** The `_frameNumber` field of the container's scene property object. */
function readFrameCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  const take = (length: number) => {
    if (length < 0 || cursor + length > bytes.length) fail("object table outside its chunk");
    const at = cursor;
    cursor += length;
    return at;
  };
  const u8 = () => view.getUint8(take(1));
  const u16 = () => view.getUint16(take(2), true);
  const u32 = () => view.getUint32(take(4), true);
  const text = (wide = false): string | null => {
    const length = wide ? u16() : u8();
    if (!length) return null;
    const at = take(length);
    return String.fromCharCode(...bytes.subarray(at, at + length - 1));
  };
  if (u32() !== 0x58424159) fail("object table signature");
  u32();
  const payload = u32();
  u32();
  if (payload + 16 !== bytes.length) fail("object table length");
  while (bytes[cursor] === 4 || bytes[cursor] === 7) {
    u8();
    text(true);
  }
  if (u8() !== 0) fail("object table header");
  text();
  while (text() !== null) u32();
  const schemas: { name: string; base: number; fields: { name: string; size: number }[] }[] = [];
  for (let name = text(); name !== null; name = text()) {
    const flag = u8();
    const base = u8();
    const reserved = u8();
    if (flag !== 1 || reserved !== 0 || base > schemas.length) fail("object schema");
    const fields: { name: string; size: number }[] = [];
    for (let field = text(); field !== null; field = text()) {
      u8();
      fields.push({ name: field, size: u16() });
    }
    schemas.push({ name, base, fields });
  }
  if (u16() !== 0) fail("object marker");
  const objects = u16();
  let frames: number | null = null;
  for (let i = 0; i < objects; i++) {
    const tag = u16();
    const size = u32();
    const end = cursor + size;
    const type = schemas[tag - 1];
    if (!type || end > bytes.length) fail("object outside its chunk");
    for (
      let schema: (typeof schemas)[number] | undefined = type;
      schema;
      schema = schema.base ? schemas[schema.base - 1] : undefined
    )
      for (const field of schema.fields) {
        const length = field.size || u32();
        const at = take(length);
        if (type.name === "uva::SceneProperty" && field.name === "_frameNumber") {
          if (length !== 4 || frames !== null) fail("frame count field");
          frames = view.getUint32(at, true);
        }
      }
    if (cursor !== end) fail("object length");
  }
  if (frames === null || frames < 1) fail("no frame count");
  return frames;
}

function chunksOf(
  bytes: Uint8Array,
  packedCamera = false,
): { chunks: Map<number, Uint8Array>; view: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (at: number) => {
    if (at < 0 || at + 4 > bytes.length) fail("read outside the resource");
    return view.getUint32(at, true);
  };
  if (word(0) !== MAGIC) fail("signature");
  const chunks = new Map<number, Uint8Array>();
  const count = word(4);
  for (let i = 0; i < count; i++) {
    const at = CHUNK_TABLE + i * CHUNK_STRIDE;
    const kind = word(at);
    const size = word(at + 8);
    const offset = word(at + 12);
    if (offset + size > bytes.length || chunks.has(kind)) fail("chunk table");
    chunks.set(kind, bytes.subarray(offset, offset + size));
  }
  const version = chunks.get(CHUNK_VERSION);
  if (!version) fail("version");
  const code = word(version.byteOffset - bytes.byteOffset);
  if (code !== VERSION && !(packedCamera && code === 0x132b5a6)) fail("version");
  return { chunks, view };
}

/** The frame count of an animation container, which every kind of container carries. */
export function cvuFrameCount(bytes: Uint8Array): number {
  const { chunks } = chunksOf(bytes);
  return readFrameCount(chunks.get(CHUNK_SCENE) ?? fail("chunk 0 missing"));
}

/** Reads the shared curve pools and frame count without requiring a node track table. */
export function readCvuPools(bytes: Uint8Array, packedCamera = false) {
  const { chunks } = chunksOf(bytes, packedCamera);
  const chunk = (kind: number) => chunks.get(kind) ?? fail(`chunk ${kind} missing`);
  const chunkView = (kind: number) => {
    const c = chunk(kind);
    return new DataView(c.buffer, c.byteOffset, c.byteLength);
  };
  const frameCount = readFrameCount(chunk(CHUNK_SCENE));
  const pool = (kind: number, stride: number) => {
    const view = chunkView(kind);
    if (view.byteLength < 4) fail("key pool length");
    const keys = view.getUint32(0, true);
    if (view.byteLength !== 4 + keys * stride) fail("key pool length");
    return Uint32Array.from({ length: (keys * stride) / 4 }, (_, i) =>
      view.getUint32(4 + i * 4, true),
    );
  };
  const floatKeys = chunks.has(CHUNK_FLOAT_KEYS) ? pool(CHUNK_FLOAT_KEYS, 12) : new Uint32Array(0);
  const packedKeys = chunks.has(CHUNK_PACKED_KEYS)
    ? pool(CHUNK_PACKED_KEYS, 8)
    : new Uint32Array(0);
  const sampledPool = <T extends Float32Array | Int16Array>(
    kind: number,
    stride: number,
    read: (view: DataView, count: number) => T,
  ): T => {
    const view = chunkView(kind);
    if (view.byteLength < 4) fail("sample pool length");
    const count = view.getUint32(0, true);
    if (view.byteLength !== 4 + count * stride) fail("sample pool length");
    return read(view, count);
  };
  const floatSamples = chunks.has(CHUNK_FLOAT_SAMPLES)
    ? sampledPool(CHUNK_FLOAT_SAMPLES, 4, (view, count) =>
        Float32Array.from({ length: count }, (_, i) => view.getFloat32(4 + i * 4, true)),
      )
    : new Float32Array(0);
  const packedSamples = chunks.has(CHUNK_PACKED_SAMPLES)
    ? sampledPool(CHUNK_PACKED_SAMPLES, 2, (view, count) =>
        Int16Array.from({ length: count }, (_, i) => view.getInt16(4 + i * 2, true)),
      )
    : new Int16Array(0);
  return { frameCount, chunks, floatKeys, packedKeys, floatSamples, packedSamples };
}

/** Decodes a node animation container: key pools, track records with their names, and the frame count. */
export function readCvu(bytes: Uint8Array): Cvu {
  const { frameCount, chunks, floatKeys, packedKeys, floatSamples, packedSamples } =
    readCvuPools(bytes);
  const nameChunk = chunks.get(CHUNK_NAMES) ?? fail("chunk 6 missing");
  const names = new TextDecoder().decode(nameChunk).split("\u0000");
  if (names.pop() !== "") fail("name pool");
  const recordChunk = chunks.get(CHUNK_TRACKS) ?? fail("chunk 1 missing");
  const records = new DataView(recordChunk.buffer, recordChunk.byteOffset, recordChunk.byteLength);
  const trackCount = records.getUint32(0, true);
  if (records.byteLength !== 4 + trackCount * TRACK_BYTES) fail("track table length");
  const tracks: CvuTrack[] = [];
  for (let i = 0; i < trackCount; i++) {
    const at = 4 + i * TRACK_BYTES;
    const flags = records.getUint32(at + 132, true);
    const descriptors: CvuDescriptor[] = [];
    for (let j = 0; j < DESCRIPTORS; j++) {
      const p = at + j * 12;
      const kind = records.getUint32(p, true);
      const start = records.getUint32(p + 4, true);
      const length = records.getUint32(p + 8, true);
      const mask =
        j < 3 ? FLAG_POSITION : j < 6 ? FLAG_SCALE : j < 10 ? FLAG_QUATERNION : FLAG_ACTIVE;
      const active = (flags & mask) !== 0;
      if (active && (length === 0 || kind > 3)) fail("animated curve without keys");
      descriptors.push({ kind, start, count: length, active });
    }
    const floats = (offset: number, n: number) =>
      Array.from({ length: n }, (_, k) => records.getFloat32(at + offset + k * 4, true));
    tracks.push({
      name: names[i] ?? null,
      flags,
      descriptors,
      position: floats(0x94, 3),
      scale: floats(0xa0, 3),
      quaternion: Array.from({ length: 4 }, (_, k) =>
        Math.fround(records.getInt16(at + 0x88 + k * 2, true) / 32767),
      ),
    });
  }
  return { frameCount, tracks, floatKeys, packedKeys, floatSamples, packedSamples };
}
