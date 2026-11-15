import type { ScoreRun } from "./common";
import { growth, type NoteRecord, type Vec } from "./storage";
import { K, LAYOUT, type StructKind } from "./tables";

export interface CanonicalVector<T = string> {
  cap: number | null;
  items: T[];
}

export interface CanonicalNote {
  vectors: Record<string, CanonicalVector>;
  hex: string;
}

export interface CanonicalScore {
  strings: Record<string, string>;
  vectors: Record<string, CanonicalVector<string | CanonicalNote>>;
  maps: Record<string, { key: number; value: CanonicalVector }[]>;
  hex: string;
}

const hexKey = (offset: number | string) => "0x" + Number(offset).toString(16);

function maskedHex(view: DataView, kind: StructKind): string {
  const mask = new Uint8Array(view.byteLength);
  for (const [start, length] of LAYOUT[kind].undefined) mask.fill(1, start, start + length);
  let out = "";
  for (let i = 0; i < view.byteLength; i++)
    out += mask[i] ? "--" : view.getUint8(i).toString(16).padStart(2, "0");
  return out;
}

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const vector = (vec: Vec<DataView>, kind: StructKind): CanonicalVector => ({
  cap: vec.cap,
  items: vec.items.map((x) => maskedHex(x, kind)),
});

const empty = (): CanonicalVector => ({ cap: null, items: [] });

function note(n: NoteRecord): CanonicalNote {
  const vectors: Record<string, CanonicalVector> = {};
  for (const [o, kind] of Object.entries(LAYOUT.note.vectors))
    vectors[hexKey(o)] = vector(n.vectors[o], kind as StructKind);
  return { vectors, hex: maskedHex(n.view, "note") };
}

export function canonicalizeScore(run: ScoreRun): CanonicalScore {
  const bpmRecords = run.timeline.bpm;
  const bpmSize = LAYOUT.bpm.size;
  let bpmCap = 0;
  for (let n = 0; n < bpmRecords.byteLength / bpmSize; n++)
    if (n === bpmCap) bpmCap = growth(bpmCap, n + 1, K.bpmVectorMax);
  const bpmItems: string[] = [];
  for (let o = 0; o < bpmRecords.byteLength; o += bpmSize)
    bpmItems.push(hexOf(bpmRecords.subarray(o, o + bpmSize)));
  const notes: CanonicalVector<CanonicalNote> = {
    cap: run.notes.cap,
    items: run.notes.items.map(note),
  };
  const strings: Record<string, string> = {};
  for (const o of LAYOUT.owner.strings)
    strings[hexKey(o)] = hexOf(run.strings.get(o) ?? new Uint8Array());
  const vectors: Record<string, CanonicalVector<string | CanonicalNote>> = {};
  for (const [o, kind] of Object.entries(LAYOUT.owner.vectors)) {
    const key = hexKey(o);
    if (kind === "bpm") vectors[key] = { cap: bpmCap, items: bpmItems };
    else if (kind === "met") vectors[key] = vector(run.timeline.met, "met");
    else if (kind === "dcm") vectors[key] = vector(run.timeline.dcm, "dcm");
    else if (kind === "clk") vectors[key] = vector(run.timeline.clk, "clk");
    else if (kind === "note") vectors[key] = notes;
    else if (kind === "owner108") vectors[key] = vector(run.clockLines, "owner108");
    else if (kind === "line")
      vectors[key] = vector(run.lines[LAYOUT.owner.lineOrder.indexOf(Number(o))], "line");
    else vectors[key] = empty();
  }
  const map = [...run.timeline.map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, vec]) => ({ key, value: vector(vec, "timelineEvent") }));
  const maps: CanonicalScore["maps"] = {};
  for (const o of Object.keys(LAYOUT.owner.maps)) maps[hexKey(o)] = map;
  return { strings, vectors, maps, hex: maskedHex(run.owner, "owner") };
}
