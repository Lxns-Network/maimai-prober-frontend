export type PackKind =
  | "texture"
  | "mesh"
  | "shader"
  | "stage"
  | "effect"
  | "hud"
  | "sample"
  | "table"
  | "uvc";
export interface PackEntry {
  name: string;
  kind: PackKind;
  offset: number;
  length: number;
  meta: Record<string, unknown>;
}
export interface Pack {
  version: 1;
  engine: string;
  entries: ReadonlyMap<string, PackEntry>;
  bytes: Uint8Array;
}
export class PackVersionError extends Error {}

const MAGIC = "CHUNPACK";

export function readPack(buffer: ArrayBuffer, expectedEngine: string): Pack {
  const bytes = new Uint8Array(buffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (bytes.length < 12 || magic !== MAGIC) throw new RangeError("Invalid pack header");
  const indexLength = new DataView(buffer).getUint32(8, true);
  if (12 + indexLength > bytes.length) throw new RangeError("Pack index out of range");
  const index = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + indexLength))) as {
    version: number;
    engine: string;
    entries: PackEntry[];
  };
  const engine = index.engine;
  if (index.version !== 1 || engine !== expectedEngine)
    throw new PackVersionError(
      `Pack ${index.engine}@${index.version} does not match ${expectedEngine}@1`,
    );
  const entries = new Map<string, PackEntry>();
  for (const entry of index.entries) {
    if (entry.offset < 0 || entry.length < 0 || entry.offset + entry.length > bytes.length)
      throw new RangeError(`Pack entry ${entry.name} out of range`);
    entries.set(entry.name, entry);
  }
  return { version: 1, engine, entries, bytes };
}

export function packSlice(pack: Pack, name: string): Uint8Array {
  const entry = pack.entries.get(name);
  if (!entry) throw new RangeError(`Pack entry ${name} missing`);
  return pack.bytes.subarray(entry.offset, entry.offset + entry.length);
}

/** A pack holding only the entries `keep` selects, copied into a buffer of their own. */
export function retainPackEntries(pack: Pack, keep: (entry: PackEntry) => boolean): Pack {
  const kept = [...pack.entries.values()].filter(keep);
  const align = (n: number) => (n + 15) & ~15;
  const bytes = new Uint8Array(kept.reduce((end, entry) => align(end) + entry.length, 0));
  const entries = new Map<string, PackEntry>();
  let end = 0;
  for (const entry of kept) {
    const offset = align(end);
    bytes.set(pack.bytes.subarray(entry.offset, entry.offset + entry.length), offset);
    entries.set(entry.name, { ...entry, offset });
    end = offset + entry.length;
  }
  return { version: 1, engine: pack.engine, entries, bytes };
}
