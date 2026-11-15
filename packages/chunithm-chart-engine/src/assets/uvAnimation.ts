export interface UvKey {
  readonly frame: number;
  readonly value: number;
  readonly tangent: number;
  readonly mode: 0 | 2 | 3;
}

/** Kind 0 is a cubic over its keys; kind 3 holds one linear sample per frame. */
export interface UvCurve {
  readonly kind: 0 | 3;
  readonly keys: readonly UvKey[];
}

export type UvChannel = "UV0" | "UV1" | "Specular" | "Normal" | "Incandescence" | "Others";

export interface UvTrack {
  readonly textureName: string;
  readonly channel: UvChannel;
  readonly materialName: string;
  readonly frameCount: number;
  readonly staticValues: readonly [number, number, number, number];
  readonly curves: readonly (UvCurve | null)[];
}

export interface UvAnimation {
  readonly frameCount: number;
  readonly tracks: readonly UvTrack[];
}

const text = new TextDecoder("utf-8", { fatal: true });
const f = Math.fround;

function fail(message: string): never {
  throw new RangeError(`UV animation: ${message}`);
}

class Reader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  position = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  take(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0 || this.position + length > this.bytes.length)
      fail("byte range outside resource");
    const result = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return result;
  }

  u8(): number {
    return this.take(1)[0];
  }

  u16(): number {
    const at = this.position;
    this.take(2);
    return this.view.getUint16(at, true);
  }

  u32(): number {
    const at = this.position;
    this.take(4);
    return this.view.getUint32(at, true);
  }

  string(wide = false): string | null {
    const length = wide ? this.u16() : this.u8();
    return length === 0 ? null : terminated(this.take(length));
  }
}

function terminated(bytes: Uint8Array): string {
  if (!bytes.length || bytes[bytes.length - 1] !== 0) fail("string has no terminator");
  const value = bytes.subarray(0, -1);
  if (value.includes(0)) fail("string has an interior terminator");
  try {
    return text.decode(value);
  } catch {
    return fail("invalid UTF-8 string");
  }
}

interface Field {
  name: string;
  size: number;
}

interface Schema {
  name: string;
  base: number;
  fields: Field[];
}

function sceneProperties(bytes: Uint8Array): { frameCount: number; trackCount: number } {
  const reader = new Reader(bytes);
  if (reader.u32() !== 0x58424159 || reader.u32() !== 1) fail("unsupported scene metadata");
  if (reader.u32() !== bytes.length - 16) fail("scene payload size mismatch");
  reader.u32();
  while (reader.bytes[reader.position] === 4 || reader.bytes[reader.position] === 7) {
    reader.u8();
    if (!reader.string(true)) fail("empty scene header");
  }
  if (reader.u8() !== 0 || !reader.string()) fail("invalid scene name");
  while (reader.string() !== null) reader.u32();

  const schemas: Schema[] = [];
  for (let name = reader.string(); name !== null; name = reader.string()) {
    if (schemas.some((schema) => schema.name === name)) fail("duplicate scene schema");
    const flag = reader.u8();
    const base = reader.u8();
    if (flag !== 1 || base > schemas.length || reader.u8() !== 0)
      fail("invalid scene schema inheritance");
    const fields: Field[] = [];
    for (let field = reader.string(); field !== null; field = reader.string()) {
      if (fields.some((prior) => prior.name === field) || reader.u8() !== 1)
        fail("invalid scene field");
      fields.push({ name: field, size: reader.u16() });
    }
    schemas.push({ name, base, fields });
  }
  if (reader.u16() !== 0) fail("invalid scene object table");
  const count = reader.u16();
  let properties: { frameCount: number; trackCount: number } | null = null;
  for (let index = 0; index < count; index++) {
    const tag = reader.u16();
    const body = new Reader(reader.take(reader.u32()));
    if (tag === 0 || tag > schemas.length) fail("invalid scene object type");
    const type = schemas[tag - 1];
    const values = new Map<string, number>();
    let schema: Schema | undefined = type;
    while (schema) {
      for (const field of schema.fields) {
        const value = body.take(field.size || body.u32());
        if (values.has(field.name)) fail("duplicate inherited scene field");
        if (
          type.name === "uva::SceneProperty" &&
          ["_magicWord", "_frameNumber", "_uvOffsetAnimationNumber"].includes(field.name)
        ) {
          if (field.size !== 4) fail("invalid scene property width");
          values.set(
            field.name,
            new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true),
          );
        }
      }
      schema = schema.base === 0 ? undefined : schemas[schema.base - 1];
    }
    if (body.position !== body.bytes.length) fail("scene object size mismatch");
    if (type.name === "uva::SceneProperty") {
      const frameCount = values.get("_frameNumber");
      const trackCount = values.get("_uvOffsetAnimationNumber");
      if (
        properties ||
        values.get("_magicWord") !== 0x30414d48 ||
        frameCount === undefined ||
        frameCount < 1 ||
        frameCount > 65536 ||
        trackCount === undefined
      )
        fail("invalid scene animation properties");
      properties = { frameCount, trackCount };
    }
  }
  if (reader.take(bytes.length - reader.position).some((value) => value !== 0))
    fail("nonzero scene trailing bytes");
  return properties ?? fail("missing scene animation properties");
}

interface Chunk {
  offset: number;
  length: number;
}

/** The chunk sets a resource may carry: float keys, or compact keys with per-frame samples. */
const LAYOUTS = ["0,2,6,9,10", "0,3,5,6,9,10"];

function directory(bytes: Uint8Array, shared: boolean): Map<number, Uint8Array> {
  const reader = new Reader(bytes);
  if (reader.u32() !== 0x00555643) fail("invalid resource magic");
  const count = reader.u32();
  const headerEnd = 0x80 + count * 0x100;
  if ((!shared && count !== 5 && count !== 6) || count > 9 || headerEnd > bytes.length)
    fail("unsupported chunk directory");
  const chunks = new Map<number, Uint8Array>();
  const ranges: Chunk[] = [];
  for (let i = 0; i < count; i++) {
    reader.position = 0x80 + i * 0x100;
    const kind = reader.u32();
    if (
      ![0, 2, 3, 5, 6, 9, 10, ...(shared ? [1, 4, 8] : [])].includes(kind) ||
      chunks.has(kind) ||
      reader.u32() !== i
    )
      fail("invalid chunk identity");
    const length = reader.u32();
    const offset = reader.u32();
    if (length === 0 || offset < headerEnd || offset + length > bytes.length)
      fail("chunk byte range outside resource");
    ranges.push({ offset, length });
    chunks.set(kind, bytes.subarray(offset, offset + length));
  }
  ranges.sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i].offset < ranges[i - 1].offset + ranges[i - 1].length) fail("overlapping chunks");
  const layout = [...chunks.keys()].sort((a, b) => a - b).join(",");
  if (shared ? ![0, 6, 9, 10].every((kind) => chunks.has(kind)) : !LAYOUTS.includes(layout))
    fail("unsupported chunk directory");
  return chunks;
}

/** A key pool: its record count and a view over its records. */
function pool(bytes: Uint8Array | undefined, recordSize: number, name: string) {
  if (!bytes) return null;
  const reader = new Reader(bytes);
  const count = reader.u32();
  if (bytes.length !== 4 + count * recordSize) fail(`${name} pool size mismatch`);
  return { count, view: reader.view };
}

function stringTable(bytes: Uint8Array): string[] {
  const strings: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    const value = terminated(bytes.subarray(start, i + 1));
    if (!value) fail("empty track name");
    strings.push(value);
    start = i + 1;
  }
  if (start !== bytes.length) fail("unterminated track name");
  return strings;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : fail("non-finite component");
}

/**
 * Decodes bounded UV resources into owned immutable tracks. Cubic curves come from float keys or
 * compact keys (an s16 value over 32767 and a frame packed with its mode), and sampled curves hold
 * one s16 value per frame; cubic key modes 0/2. The shared Stage layout additionally accepts the
 * UV1, Specular, Normal and Incandescence material parameter channels.
 * @throws RangeError for malformed metadata, names, ranges, values or key spans, or a curve whose
 * key pool the resource does not carry. The bounded Stage layout additionally allows a terminal
 * float or compact key with mode 0 at the final frame.
 */
export function readUvAnimation(bytes: Uint8Array, shared = false): UvAnimation {
  const chunks = directory(bytes, shared);
  const version = new Reader(chunks.get(10)!);
  if (version.bytes.length !== 4 || version.u32() !== 20130903) fail("unsupported format version");
  const { frameCount, trackCount } = sceneProperties(chunks.get(0)!);
  const names = stringTable(chunks.get(6)!);
  const strings = shared ? names.slice(Math.max(0, names.length - trackCount * 3)) : names;
  const records = new Reader(chunks.get(9)!);
  const count = records.u32();
  if (
    count !== trackCount ||
    records.bytes.length !== 4 + count * 68 ||
    strings.length !== count * 3
  )
    fail("track count or byte size mismatch");
  const floats = pool(chunks.get(2), 12, "key");
  const compact = pool(chunks.get(3), 8, "compact key");
  const sampled = pool(chunks.get(5), 2, "sample");
  const tracks: UvTrack[] = [];
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 68;
    const flags = records.view.getUint32(at + 48, true);
    if (flags & ~0x1e000) fail("unsupported track flags");
    const curves: (UvCurve | null)[] = [];
    for (let c = 0; c < 4; c++) {
      if (!(flags & (0x2000 << c))) {
        curves.push(null);
        continue;
      }
      const type = records.view.getUint32(at + c * 12, true);
      const start = records.view.getUint32(at + c * 12 + 4, true);
      const length = records.view.getUint32(at + c * 12 + 8, true);
      const source = type === 0 ? floats : type === 1 ? compact : type === 3 ? sampled : null;
      if (!source || length === 0 || start + length > source.count)
        fail("unsupported curve or key range");
      if (type === 3) {
        if (length !== frameCount) fail("sampled curves need one sample per frame");
        const samples: UvKey[] = [];
        for (let k = 0; k < length; k++)
          samples.push(
            Object.freeze({
              frame: k,
              mode: k === length - 1 ? 2 : 3,
              value: f(source.view.getInt16(4 + (start + k) * 2, true) / 32767),
              tangent: 0,
            }),
          );
        curves.push(Object.freeze({ kind: 3, keys: Object.freeze(samples) }));
        continue;
      }
      const keys: UvKey[] = [];
      for (let k = 0; k < length; k++) {
        let frame: number;
        let mode: number;
        let value: number;
        let tangent: number;
        if (type === 0) {
          const p = 4 + (start + k) * 12;
          frame = source.view.getUint16(p + 8, true);
          mode = source.view.getUint16(p + 10, true);
          value = finite(source.view.getFloat32(p, true));
          tangent = finite(source.view.getFloat32(p + 4, true));
        } else {
          const p = 4 + (start + k) * 8;
          const word = source.view.getUint16(p + 6, true);
          frame = word & 0x3fff;
          mode = word >>> 14;
          value = f(source.view.getInt16(p + 4, true) / 32767);
          tangent = finite(source.view.getFloat32(p, true));
        }
        if (
          (mode !== 0 && mode !== 2) ||
          frame >= frameCount ||
          (k > 0 && frame <= keys[k - 1].frame)
        )
          fail("invalid curve key");
        keys.push(Object.freeze({ frame, mode, value, tangent }));
      }
      const terminal = keys[length - 1];
      if (
        keys[0].frame !== 0 ||
        terminal.frame !== frameCount - 1 ||
        (terminal.mode !== 2 && !(shared && length > 1 && terminal.mode === 0))
      )
        fail("curve keys must span the animation");
      curves.push(Object.freeze({ kind: 0, keys: Object.freeze(keys) }));
    }
    const channel = strings[i * 3 + 1];
    if (
      channel !== "UV0" &&
      channel !== "Others" &&
      !(shared && ["UV1", "Specular", "Normal", "Incandescence"].includes(channel))
    )
      fail("unsupported track channel");
    const staticValues = Object.freeze([
      finite(records.view.getFloat32(at + 52, true)),
      finite(records.view.getFloat32(at + 56, true)),
      1,
      1,
    ] as const);
    tracks.push(
      Object.freeze({
        frameCount,
        textureName: strings[i * 3],
        channel: channel as UvChannel,
        materialName: strings[i * 3 + 2],
        staticValues,
        curves: Object.freeze(curves),
      }),
    );
  }
  return Object.freeze({ frameCount, tracks: Object.freeze(tracks) });
}

function sampleCurve(curve: UvCurve, frame: number): number {
  const keys = curve.keys;
  let low = curve.kind === 3 ? Math.floor(frame) : 0;
  let high = keys.length - 1;
  while (curve.kind !== 3 && low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (keys[middle].frame <= frame) low = middle;
    else high = middle - 1;
  }
  const a = keys[low];
  if (a.mode === 2) return a.value;
  const b = keys[low + 1] ?? keys[0];
  const dt = f(frame - a.frame);
  if (curve.kind === 3) return dt === 0 ? a.value : f(f(a.value * f(1 - dt)) + f(b.value * dt));
  const nextFrame = b.frame < a.frame ? f(a.frame + 1) : b.frame;
  const t = f(dt / f(nextFrame - a.frame));
  const m = f(t - 1);
  const termA = f(f(f(f(m + m) - 1) * f(t * t)) * f(a.value - b.value));
  const termB = f(f(f(f(b.tangent * t) + f(a.tangent * m)) * m) * dt);
  return f(f(termA + termB) + a.value);
}

/**
 * Writes [offsetU, offsetV, scaleU, scaleV] into the first four output elements without allocation.
 * Frame is checked before float32 rounding; callers provide looping/clamping separately.
 * @throws RangeError outside [0, track.frameCount - 1] or when output has fewer than four elements.
 */
export function sampleUvTrack(track: UvTrack, frame: number, output: Float32Array): void {
  if (!Number.isFinite(frame) || frame < 0 || frame > track.frameCount - 1)
    fail("sample frame outside animation");
  if (output.length < 4) fail("sample output needs four elements");
  const rounded = f(frame);
  for (let c = 0; c < 4; c++) {
    const curve = track.curves[c];
    output[c] = curve === null ? track.staticValues[c] : sampleCurve(curve, rounded);
  }
}
