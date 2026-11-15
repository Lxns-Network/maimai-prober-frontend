import { createHash, type Hash } from "node:crypto";
import { hexByte } from "../bind/hexByte";
import type { ChartReply } from "../worker/protocol";
import type { ParsedScore } from "./parseChart";

/** Sequence and counter fields of a note record; only whether each is negative is compared. */
const NOTE_COUNTERS = [0x78, 0x7c, 0x80, 0x84];
/** Joint serial, or the sequence of a timeline row; not compared. */
const ROW_SERIAL = 0x0c;
const JOINT_BYTES = 36;
const EVENT_BYTES = 32;
const MET_BYTES = 24;
const BPM_BYTES = 20;
const JOINT_VECTORS = new Set(["0x40", "0x50"]);

const bytesOf = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = hexByte(hex, i * 2);
  return out;
}

function noteKey(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const view = new DataView(out.buffer);
  for (const offset of NOTE_COUNTERS)
    view.setInt32(offset, view.getInt32(offset, true) < 0 ? -1 : 0, true);
  return out;
}

function rowsKey(bytes: Uint8Array, stride: number): Uint8Array {
  const out = bytes.slice();
  for (let at = 0; at < out.length; at += stride) out.fill(0, at + ROW_SERIAL, at + ROW_SERIAL + 4);
  return out;
}

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

function concat(views: readonly DataView[]): Uint8Array {
  const out = new Uint8Array(views.reduce((n, v) => n + v.byteLength, 0));
  let at = 0;
  for (const view of views) {
    out.set(bytesOf(view), at);
    at += view.byteLength;
  }
  return out;
}

/** Differences between two loaded scores in what the engine reads from them. */
export function parsedDifferences(a: ParsedScore, b: ParsedScore): string[] {
  const out: string[] = [];
  const compare = (name: string, x: Uint8Array, y: Uint8Array) => {
    if (!equal(x, y)) out.push(name);
  };
  if (a.run.resolution !== b.run.resolution) out.push("resolution");
  const notes = (p: ParsedScore) =>
    p.canonical.vectors["0x15c"].items as {
      hex: string;
      vectors: Record<string, { items: string[] }>;
    }[];
  const [na, nb] = [notes(a), notes(b)];
  if (na.length !== nb.length) out.push(`note count ${na.length} != ${nb.length}`);
  else
    na.forEach((note, i) => {
      compare(`note ${i}`, noteKey(hexBytes(note.hex)), noteKey(hexBytes(nb[i].hex)));
      for (const key of new Set([...Object.keys(note.vectors), ...Object.keys(nb[i].vectors)])) {
        const rows = (n: typeof note) => (n.vectors[key]?.items ?? []).map(hexBytes);
        const [ra, rb] = [rows(note), rows(nb[i])];
        const key36 = (r: Uint8Array) => (JOINT_VECTORS.has(key) ? rowsKey(r, JOINT_BYTES) : r);
        if (ra.length !== rb.length) out.push(`note ${i} ${key} count`);
        else ra.forEach((r, k) => compare(`note ${i} ${key}[${k}]`, key36(r), key36(rb[k])));
      }
    });
  const keyed = (p: ParsedScore) =>
    [...p.run.timeline.map]
      .filter(([, v]) => v.items.length)
      .sort((x, y) => x[0] - y[0])
      .map(([key, v]) => [key, rowsKey(concat(v.items), EVENT_BYTES)] as const);
  const [ka, kb] = [keyed(a), keyed(b)];
  if (ka.map(([k]) => k).join() !== kb.map(([k]) => k).join()) out.push("speed layers");
  else ka.forEach(([key, rows], i) => compare(`speed layer ${key}`, rows, kb[i][1]));
  const rows = (p: ParsedScore, name: "dcm" | "met", stride: number) =>
    rowsKey(concat(p.run.timeline[name].items), stride);
  compare("scroll", rows(a, "dcm", EVENT_BYTES), rows(b, "dcm", EVENT_BYTES));
  compare("meters", rows(a, "met", MET_BYTES), rows(b, "met", MET_BYTES));
  compare("tempos", rowsKey(a.run.timeline.bpm, BPM_BYTES), rowsKey(b.run.timeline.bpm, BPM_BYTES));
  return out;
}

function walk(h: Hash, value: unknown): void {
  if (value instanceof Map) {
    h.update("M");
    for (const [k, v] of value) {
      walk(h, k);
      walk(h, v);
    }
    h.update("m");
  } else if (value instanceof ArrayBuffer) {
    h.update(`B${value.byteLength}:`);
    h.update(new Uint8Array(value));
  } else if (ArrayBuffer.isView(value)) {
    h.update(`V${value.byteLength}:`);
    h.update(bytesOf(value));
  } else if (Array.isArray(value)) {
    h.update("[");
    for (const v of value) walk(h, v);
    h.update("]");
  } else if (value !== null && typeof value === "object") {
    h.update("{");
    for (const [k, v] of Object.entries(value)) {
      h.update(`${k}=`);
      walk(h, v);
    }
    h.update("}");
  } else h.update(`${typeof value}:${Object.is(value, -0) ? "-0" : String(value)};`);
}

/** Digest of each part of a chart worker reply, with sequences, counters and serials masked as in {@link parsedDifferences}. */
export function replyDigest(reply: ChartReply): Record<string, string> {
  if (!reply.ok) throw new Error(reply.error.message);
  const { timeline, score, motion, lifetimes, effects } = reply;
  if (!score || !motion || !lifetimes || !effects) throw new Error("The reply has no render data");
  const digest: Record<string, string> = {};
  const section = (name: string, fill: (h: Hash) => void) => {
    const h = createHash("sha1");
    fill(h);
    digest[name] = h.digest("hex");
  };
  const {
    records,
    timeline: layers,
    scroll,
    slideJoints,
    airSlides,
    airHolds,
    ladders,
    ...rest
  } = score;
  const joints = (h: Hash, map: ReadonlyMap<number, readonly DataView[]> | undefined) => {
    for (const [key, list] of map ?? []) {
      h.update(`${key}:`);
      for (const j of list) h.update(rowsKey(bytesOf(j), JOINT_BYTES));
    }
  };
  section("timeline", (h) => h.update(new Uint8Array(timeline)));
  section("records", (h) => records.forEach((r) => h.update(noteKey(bytesOf(r)))));
  section("speed layers", (h) => {
    for (const [key, rows] of [...layers].sort((x, y) => x[0] - y[0])) {
      h.update(`${key}:`);
      h.update(rowsKey(bytesOf(rows), EVENT_BYTES));
    }
  });
  section("scroll", (h) => h.update(rowsKey(bytesOf(scroll), EVENT_BYTES)));
  section("slide joints", (h) => joints(h, slideJoints));
  section("air slides", (h) => joints(h, airSlides));
  section("air holds", (h) => joints(h, airHolds));
  section("ladders", (h) => {
    for (const [key, ladder] of ladders ?? []) {
      h.update(`${key}:`);
      for (const j of ladder.joints) h.update(rowsKey(bytesOf(j), JOINT_BYTES));
      walk(h, ladder.samples);
    }
  });
  section("score", (h) => walk(h, rest));
  section("motion", (h) => walk(h, motion));
  section("lifetimes", (h) => walk(h, lifetimes));
  section("effects", (h) => walk(h, effects));
  return digest;
}
