import {
  accumulateBpmTimes,
  canonicalizeScore,
  sortPositionRecords,
  writePosition,
} from "./c2s/index";
import { readScoreNote } from "./c2s/chart";
import { fround } from "./c2s/float32";
import { HEADER_PATH_OFFSET, initializeHeader, readHeaderPass } from "./c2s/header";
import { BPM_SORT_STRIDE } from "./c2s/introsort";
import {
  J40,
  J50,
  copyPos,
  f32,
  i32,
  lastOf,
  position,
  realWidth,
  setF32,
  setI32,
  tailLane,
  tailWidth,
  u32,
  widthIndex,
  type ScoreRun,
} from "./c2s/score/common";
import { POST_PROCESS_STEPS, POST_PROCESS_STEP_INDEX } from "./c2s/score/postProcess";
import { retimeSamples, sampleJoints } from "./c2s/score/production";
import { Vec, applyStores, blob, newNote, push, type NoteRecord } from "./c2s/score/storage";
import { F, K, LAYOUT, PK, STORES, T } from "./c2s/score/tables";
import { ChartParseError, type ParseOptions, type ParsedScore } from "./parseChart";

const FORMAT_KEY = "&format=";
const MAJOR_VERSION = 1;
const MAX_INT32 = 0x7fffffff;
const MAX_WIDTH = 16;
const RESOLUTION = 384;

const EFFECTS = ["up", "down", "center", "rcircle", "lcircle", "rside", "lside", "both"];
const AIR_COLORS = ["default", "green", "pink"];
const AIR_DIRECTIONS = ["up", "upright", "upleft", "down", "downright", "downleft"];
const CRUSH_COLORS = [
  "default",
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "aqua",
  "cyan",
  "darkgreen",
  "blue",
  "purple",
  "violet",
  "pink",
  "gray",
  "black",
  "none",
];

const TIMELINE = new Set(["bpm", "beat", "speed", "scroll"]);
const OBJECTS = new Set(["tap", "flick", "mine", "hold", "slide", "crush", "sla"]);

const TYPE = { tap: 0, hold: 1, slide: 2, exTap: 4, flick: 6, crush: 9, mine: 11, sla: 12 };
const SECONDARY = { air: 3, airHold: 5, airSlide: 8 };

interface Line {
  number: number;
  words: string[];
}

interface ChartObject {
  line: Line;
  attachments: Line[];
}

interface ChartBody {
  lines: { number: number; text: string }[];
  tutorial: boolean;
  comboBpm: number | null;
}

interface Lanes {
  lane: number;
  width: number;
}

function fail(line: number | null, message: string): never {
  throw new ChartParseError(line === null ? message : `line ${line}: ${message}`, line);
}

class Cursor {
  private at = 1;

  constructor(readonly line: Line) {}

  get name(): string {
    return this.line.words[0];
  }

  peek(): string | undefined {
    return this.line.words[this.at];
  }

  next(what: string): string {
    const word = this.line.words[this.at];
    if (word === undefined) this.fail(`expected ${what}`);
    this.at++;
    return word;
  }

  end(): void {
    const word = this.peek();
    if (word !== undefined) this.fail(`unexpected "${word}"`);
  }

  fail(message: string): never {
    return fail(this.line.number, message);
  }

  tick(what: string, text = this.next(what)): number {
    if (!/^\d+$/.test(text)) this.fail(`"${text}" is not a tick`);
    const tick = Number(text);
    if (!Number.isSafeInteger(tick) || Math.floor(tick / RESOLUTION) > MAX_INT32)
      this.fail(`tick ${text} is out of range`);
    return tick;
  }

  /** The end of a span starting at `from`; the end offset within the start measure must fit 32 bits. */
  until(from: number, what: string, text = this.next(what)): number {
    const to = this.tick(what, text);
    if (to < from) this.fail(`${to} is before ${from}`);
    if ((from % RESOLUTION) + (to - from) > MAX_INT32) this.fail(`span ${from}..${to} is too long`);
    return to;
  }

  range(): [number, number] {
    const text = this.next("a tick range");
    const match = /^(\d+)\.\.(\d+)$/.exec(text);
    if (!match) this.fail(`"${text}" is not a tick range`);
    const start = this.tick("a start tick", match[1]);
    return [start, this.until(start, "an end tick", match[2])];
  }

  integer(what: string, text = this.next(what)): number {
    const value = Number(text);
    if (!/^-?\d+$/.test(text) || value < -MAX_INT32 - 1 || value > MAX_INT32)
      this.fail(`"${text}" is not a 32-bit integer`);
    return value;
  }

  lanes(): Lanes {
    const text = this.next("lanes");
    const match = /^(-?\d+)(?:-(-?\d+))?$/.exec(text);
    if (!match) this.fail(`"${text}" is not a lane range`);
    const lane = Number(match[1]);
    const width = match[2] === undefined ? 1 : Number(match[2]) - lane + 1;
    if (lane < -MAX_INT32 - 1 || lane > MAX_INT32 || !(width >= 1 && width <= MAX_WIDTH))
      this.fail(`"${text}" is not 1 to ${MAX_WIDTH} lanes`);
    return { lane, width };
  }

  /** Height in tenths. */
  height(): number {
    const text = this.next("a height");
    const match = /^h(-?)(\d+)(?:\.(\d))?$/.exec(text);
    const tenths = match ? Number(match[2]) * 10 + Number(match[3] ?? 0) : NaN;
    if (!match || tenths > MAX_INT32) this.fail(`"${text}" is not a height`);
    return match[1] ? -tenths : tenths;
  }

  decimal(what: string, text = this.next(what)): number {
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) this.fail(`"${text}" is not a decimal`);
    const value = fround(Number(text));
    if (!Number.isFinite(value)) this.fail(`${text} is out of range`);
    return value;
  }

  word(table: readonly string[], what: string, text = this.next(what)): number {
    const index = table.indexOf(text);
    if (index < 0) this.fail(`"${text}" is not ${what}`);
    return index;
  }

  /** True for a shown point (`->`), false for a curve point (`~>`). */
  arrow(text = this.next("an arrow")): boolean {
    if (text !== "->" && text !== "~>") this.fail(`expected an arrow, found "${text}"`);
    return text === "->";
  }
}

const isArrow = (word: string | undefined) => word === "->" || word === "~>";

/** True when `bytes` starts with this format's version line. */
export function isLxchu(bytes: Uint8Array): boolean {
  const prefix = FORMAT_KEY + "lxchu/";
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix.charCodeAt(i)) return false;
  return true;
}

function selectChart(text: string, difficulty: number): ChartBody {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith("\r")) lines[i] = lines[i].slice(0, -1);
  }
  const version = /^&format=lxchu\/(\d+)(?:\.\d+)?$/.exec(lines[0]);
  if (!lines[0].startsWith(FORMAT_KEY)) fail(1, "the first line must declare &format=lxchu/1");
  if (!version || Number(version[1]) !== MAJOR_VERSION)
    fail(1, `unsupported format ${lines[0].slice(FORMAT_KEY.length)}`);
  const body: ChartBody = { lines: [], tutorial: false, comboBpm: null };
  let found = false;
  let state: "header" | "skip" | "read" = "header";
  for (let i = 1; i < lines.length; i++) {
    const number = i + 1;
    const line = lines[i];
    if (!line.startsWith("&")) {
      if (state === "read") body.lines.push({ number, text: line });
      else if (state === "header" && line.trim() && !line.trimStart().startsWith("#"))
        fail(number, "text outside a chart body");
      continue;
    }
    const equals = line.indexOf("=");
    if (equals < 0) fail(number, "a key line needs '='");
    const value = line.slice(equals + 1);
    const keyed = /^(chart|tutorial|combo_bpm)_(\d+)$/.exec(line.slice(1, equals));
    state = "header";
    if (!keyed) continue;
    if (keyed[1] === "chart") state = "skip";
    if (Number(keyed[2]) !== difficulty) continue;
    if (keyed[1] === "chart") {
      if (found) fail(number, `chart ${difficulty} is defined twice`);
      if (value) fail(number, "the chart body starts on the next line");
      found = true;
      state = "read";
    } else if (keyed[1] === "tutorial") {
      if (value !== "0" && value !== "1") fail(number, "tutorial must be 0 or 1");
      body.tutorial = value === "1";
    } else {
      const tempo = new Cursor({ number, words: [] }).decimal("a tempo", value);
      if (!(tempo > 0)) fail(number, "the combo tempo must be positive");
      body.comboBpm = tempo;
    }
  }
  if (!found) fail(null, `difficulty ${difficulty} is not in the chart`);
  return body;
}

function splitBody(body: ChartBody): { timeline: Line[]; objects: ChartObject[] } {
  const timeline: Line[] = [];
  const objects: ChartObject[] = [];
  let current: ChartObject | null = null;
  let extension = false;
  for (const { number, text } of body.lines) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = { number, words: trimmed.split(/ +/) };
    const name = line.words[0];
    if (text !== text.trimStart()) {
      if (extension || name.startsWith("x-")) continue;
      if (!current) fail(number, "an attachment needs a note object above it");
      current.attachments.push(line);
      continue;
    }
    current = null;
    extension = name.startsWith("x-");
    if (extension) continue;
    if (TIMELINE.has(name) || name.startsWith("speed:")) {
      if (objects.length) fail(number, "timeline lines must come before note objects");
      timeline.push(line);
    } else if (OBJECTS.has(name)) {
      current = { line, attachments: [] };
      objects.push(current);
    } else fail(number, `unknown line "${name}"`);
  }
  return { timeline, objects };
}

const beatOf = (v: DataView, o: number) => fround(fround(f32(v, o) * F.beatScale) + f32(v, o + 4));

/** Count of the SLA area covering a position and lane range; 0 when none does. */
function slaAt(areas: readonly DataView[], pv: DataView, po: number, lane: number, width: number) {
  let result = 0;
  for (const sv of areas) {
    const count = i32(sv, 0x70);
    const sLane = i32(sv, 0x28);
    const sWidth = realWidth(i32(sv, 0x2c));
    if (result >= count) continue;
    const at = fround(beatOf(pv, po) + F.nearEpsilon);
    if (!(at >= beatOf(sv, 0))) continue;
    if (at >= beatOf(sv, 0x30)) continue;
    if (lane < sLane) continue;
    if (((lane + width) | 0) <= ((sLane + sWidth) | 0)) result = count;
  }
  return result;
}

/** Writes each note's SLA counts at its start and its tail, looking only at the SLA areas. */
function assignSla(run: ScoreRun): void {
  const areas = run.notes.items.filter((n) => i32(n.view, 0x10) === PK.typeSla).map((n) => n.view);
  let src: { view: DataView; off: number } | null = null;
  let src2: { view: DataView; off: number } | null = null;
  let lane1 = -1;
  let width1 = -1;
  let lane2 = -1;
  let width2 = -1;
  for (const n of run.notes.items) {
    const v = n.view;
    const type = i32(v, 0x10);
    const path = type >>> 0 > PK.slaPathMaxType ? PK.slaPathDefault : T.slaPath[type];
    if (path === 3) continue;
    if (path === 0 || path === 1 || path === 2) {
      lane1 = i32(v, 0x28);
      width1 = realWidth(i32(v, 0x2c));
      src = { view: v, off: 0 };
      if (path === 1) {
        lane2 = i32(v, 0x28);
        width2 = realWidth(i32(v, 0x2c));
        src2 = { view: v, off: 0x30 };
      }
      if (path === 2 && n.vectors[J40].items.length) {
        const j = lastOf(n.vectors[J40]);
        src2 = { view: j, off: 0 };
        lane2 = i32(j, 0x10);
        width2 = realWidth(i32(j, 0x20));
      }
    }
    setI32(v, 0x70, src ? slaAt(areas, src.view, src.off, lane1, width1) : 0);
    setI32(v, 0x74, src2 ? slaAt(areas, src2.view, src2.off, lane2, width2) : 0);
  }
}

const POST_PROCESS = POST_PROCESS_STEPS.map((step, i) =>
  i === POST_PROCESS_STEP_INDEX.assignSla ? assignSla : step,
);

function buildRun(body: ChartBody, mirror: boolean): ScoreRun {
  const { timeline, objects } = splitBody(body);
  const owner = blob(LAYOUT.owner.size);
  const strings = new Map<number, Uint8Array>();
  applyStores(owner, STORES.ownerConstructor);
  initializeHeader(owner, strings);
  setI32(owner, 0, 0);
  strings.set(HEADER_PATH_OFFSET, new Uint8Array());
  let sequence = readHeaderPass(owner, strings, []);
  if (body.tutorial) owner.setUint8(PK.tutorialOffset, 1);
  if (body.comboBpm !== null) setF32(owner, PK.progJudgeBpmOffset, body.comboBpm);
  const resolution = u32(owner, K.resolutionOffset);
  const nextSequence = () => {
    const current = sequence;
    sequence = (sequence + 1) >>> 0;
    return current;
  };

  const tempos = timeline.filter((line) => line.words[0] === "bpm");
  const stride = LAYOUT.bpm.size;
  const bpm = new Uint8Array(tempos.length * stride);
  tempos.forEach((line, i) => {
    const c: Cursor = new Cursor(line);
    const tick = c.tick("a tick");
    const value = c.decimal("a tempo");
    c.end();
    const record = new DataView(bpm.buffer, i * stride, stride);
    writePosition(record, Math.floor(tick / RESOLUTION), tick % RESOLUTION, RESOLUTION);
    record.setUint32(0x0c, nextSequence(), true);
    record.setFloat32(0x10, value, true);
  });
  if (bpm.byteLength) {
    const view = new DataView(bpm.buffer);
    sortPositionRecords(view, BPM_SORT_STRIDE);
    accumulateBpmTimes(view);
  }

  const run: ScoreRun = {
    mirror,
    serial: 0,
    counter: 0,
    diagnostics: [],
    resolution,
    bpm: new DataView(bpm.buffer),
    timeline: { bpm, met: new Vec(), dcm: new Vec(), clk: new Vec(), map: new Map() },
    notes: new Vec(),
    lines: [new Vec(), new Vec(), new Vec(), new Vec()],
    clockLines: new Vec(),
    owner,
    strings,
  };
  const at = (view: DataView, offset: number, tick: number) =>
    position(run, view, offset, Math.floor(tick / RESOLUTION), tick % RESOLUTION);
  const span = (view: DataView, offset: number, from: number, to: number) =>
    position(run, view, offset, Math.floor(from / RESOLUTION), (from % RESOLUTION) + (to - from));
  const counters = (v: DataView, count: number) => {
    setI32(v, 0x7c, run.counter);
    if (count === 2) setI32(v, 0x80, run.counter + 1);
    run.counter = (run.counter + count) | 0;
  };
  const joint = (rec: NoteRecord, width = u32(rec.view, 0x2c)) => {
    const j = blob(LAYOUT.joint.size);
    run.serial = (run.serial + 1) >>> 0;
    applyStores(j, STORES.jointConstructor, { width, serial: run.serial });
    return j;
  };
  const placeJoint = (j: DataView, { lane, width }: Lanes) => {
    setI32(j, 0x20, widthIndex(width));
    setI32(j, 0x10, mirror ? (K.mirrorBase - lane - realWidth(i32(j, 0x20))) | 0 : lane);
  };
  const pushJoint = (vector: Vec<DataView>, j: DataView) => push(vector, j, K.jointVectorMax);

  for (const line of timeline) {
    const c: Cursor = new Cursor(line);
    const name = c.name;
    if (name === "bpm") continue;
    if (name === "beat") {
      const tick = c.tick("a tick");
      const text = c.next("a meter");
      const meter = /^(-?\d+)\/(-?\d+)$/.exec(text);
      if (!meter) c.fail(`"${text}" is not a meter`);
      c.end();
      const upper = c.integer("a meter", meter[1]);
      const lower = c.integer("a meter", meter[2]);
      const e = blob(LAYOUT.met.size);
      applyStores(e, STORES.metConstructor);
      at(e, 0, tick);
      setI32(e, 0x10, lower);
      setI32(e, 0x14, upper);
      setI32(e, 0x0c, nextSequence());
      push(run.timeline.met, e, K.metVectorMax);
      continue;
    }
    let key = 0;
    if (name.startsWith("speed:")) key = c.integer("a layer", name.slice(6));
    const [start, end] = c.range();
    const value = c.decimal("a value");
    c.end();
    const scroll = name === "scroll";
    const e = blob(LAYOUT.timelineEvent.size);
    applyStores(e, scroll ? STORES.dcmConstructor : STORES.eventConstructor);
    at(e, 0, start);
    setF32(e, 0x10, value);
    span(e, 0x14, start, end);
    setI32(e, 0x0c, nextSequence());
    if (scroll) {
      push(run.timeline.dcm, e, K.eventVectorMax);
      continue;
    }
    let events = run.timeline.map.get(key);
    if (!events) run.timeline.map.set(key, (events = new Vec()));
    push(events, e, K.mapVectorMax);
  }

  for (const { line, attachments } of objects) {
    const c: Cursor = new Cursor(line);
    const rec = newNote();
    const v = rec.view;
    const begin = (type: number, start: number, { lane, width }: Lanes) => {
      setI32(v, 0x10, type);
      at(v, 0, start);
      copyPos(v, 0x30, v, 0);
      setI32(v, 0x28, mirror ? (K.mirrorBase - width - lane) | 0 : lane);
      setI32(v, 0x2c, widthIndex(width));
      setI32(v, 0x78, nextSequence());
    };
    const effect = () => {
      if (c.peek() !== "ex") return -1;
      c.next("ex");
      return c.word(EFFECTS, "an ExTAP effect");
    };
    let tail: number;
    switch (c.name) {
      case "tap":
      case "flick":
      case "mine": {
        tail = c.tick("a tick");
        const lanes = c.lanes();
        const ex = c.name === "tap" ? effect() : -1;
        c.end();
        const type = ex >= 0 ? TYPE.exTap : TYPE[c.name as "tap" | "flick" | "mine"];
        begin(type, tail, lanes);
        counters(v, 1);
        if (ex >= 0) setI32(v, 0x88, ex);
        break;
      }
      case "hold":
      case "sla": {
        const [start, end] = c.range();
        const lanes = c.lanes();
        const hold = c.name === "hold";
        const ex = hold ? effect() : -1;
        const count = hold ? 0 : c.integer("an SLA count");
        c.end();
        begin(hold ? TYPE.hold : TYPE.sla, start, lanes);
        counters(v, 2);
        span(v, 0x30, start, end);
        if (hold) {
          v.setUint8(0x8c, ex >= 0 ? 1 : 0);
          if (ex >= 0) setI32(v, 0x88, ex);
        } else setI32(v, 0x70, count);
        tail = end;
        break;
      }
      case "slide": {
        const start = c.tick("a tick");
        const lanes = c.lanes();
        const ex = effect();
        begin(TYPE.slide, start, lanes);
        counters(v, 2);
        tail = start;
        do {
          const shown = c.arrow();
          const to = c.until(tail, "a tick");
          const j = joint(rec);
          span(j, 0, tail, to);
          placeJoint(j, c.lanes());
          j.setUint8(0x14, shown ? 1 : 0);
          pushJoint(rec.vectors[J40], j);
          tail = to;
        } while (c.peek() !== undefined);
        copyPos(v, 0x30, lastOf(rec.vectors[J40]), 0);
        v.setUint8(0x8c, ex >= 0 ? 1 : 0);
        if (ex >= 0) setI32(v, 0x88, ex);
        setI32(v, 0x98, 0);
        break;
      }
      case "crush": {
        const start = c.tick("a tick");
        const lanes = c.lanes();
        const height = c.height();
        let word = c.next("an arrow");
        let every = 0;
        let color = 0;
        if (word === "every") {
          every = c.integer("an interval");
          word = c.next("an arrow");
        }
        if (!isArrow(word)) {
          color = c.word(CRUSH_COLORS, "a crush color", word);
          word = c.next("an arrow");
        }
        begin(TYPE.crush, start, lanes);
        counters(v, 2);
        setI32(v, 0x94, color);
        setI32(v, 0x9c, height);
        tail = start;
        for (;;) {
          if (!c.arrow(word)) c.fail("crush points are written with ->");
          const to = c.until(tail, "a tick");
          const j = joint(rec);
          span(j, 0, tail, to);
          placeJoint(j, c.lanes());
          setI32(j, 0x18, c.height());
          j.setUint8(0x14, 0);
          pushJoint(rec.vectors[J40], j);
          tail = to;
          if (c.peek() === undefined) break;
          word = c.next("an arrow");
        }
        copyPos(v, 0x30, lastOf(rec.vectors[J40]), 0);
        sampleJoints(run, rec, every);
        retimeSamples(run, rec);
        break;
      }
      default:
        c.fail(`unknown object "${c.name}"`);
    }

    let attached: string | null = null;
    for (const attachment of attachments) {
      const a: Cursor = new Cursor(attachment);
      if (attached !== null && !(attached === "airhold" && a.name === "airhold"))
        a.fail("a note takes one air, one chain of airhold lines or one airslide");
      const first = attached === null;
      attached = a.name;
      if (a.name === "air") {
        const direction = a.word(AIR_DIRECTIONS, "an AIR direction");
        const color = a.peek() === undefined ? 0 : a.word(AIR_COLORS, "an AIR color");
        a.end();
        setI32(v, 0x14, SECONDARY.air);
        setI32(v, 0x84, run.counter);
        setI32(v, 0x94, color);
        setI32(v, 0x90, T.airDirection[direction][mirror ? 1 : 0]);
        run.counter = (run.counter + 1) | 0;
      } else if (a.name === "airhold") {
        let word = a.next("an arrow");
        let color = 0;
        if (!isArrow(word)) {
          if (!first) a.fail("only the first airhold line carries a color");
          color = a.word(AIR_COLORS, "an AIR color", word);
          word = a.next("an arrow");
        }
        const shown = a.arrow(word);
        const to = a.until(tail, "an end tick");
        a.end();
        if (first) {
          setI32(v, 0x94, color);
          setI32(v, 0x14, SECONDARY.airHold);
        } else if (v.getUint8(0x24) !== 0) {
          const j = joint(rec, tailWidth(rec) >>> 0);
          copyPos(j, 0, v, 0x18);
          setI32(j, 0x10, tailLane(rec));
          pushJoint(rec.vectors[J50], j);
        }
        span(v, 0x18, tail, to);
        v.setUint8(0x24, shown ? 1 : 0);
        if (first && i32(v, 0x84) < 0) {
          setI32(v, 0x84, run.counter);
          run.counter = (run.counter + 1) | 0;
        }
        tail = to;
      } else if (a.name === "airslide") {
        const height = a.height();
        let word = a.next("an arrow");
        let color = 0;
        if (!isArrow(word)) {
          color = a.word(AIR_COLORS, "an AIR color", word);
          word = a.next("an arrow");
        }
        setI32(v, 0x14, SECONDARY.airSlide);
        setI32(v, 0x9c, height);
        setI32(v, 0x94, color);
        for (;;) {
          const shown = a.arrow(word);
          const to = a.until(tail, "a tick");
          const j = joint(rec);
          span(j, 0, tail, to);
          placeJoint(j, a.lanes());
          setI32(j, 0x18, a.height());
          j.setUint8(0x14, shown ? 1 : 0);
          pushJoint(rec.vectors[J50], j);
          copyPos(v, 0x18, j, 0);
          tail = to;
          if (a.peek() === undefined) break;
          word = a.next("an arrow");
        }
        if (i32(v, 0x84) < 0) {
          setI32(v, 0x84, run.counter);
          run.counter = (run.counter + 1) | 0;
        }
      } else a.fail(`unknown attachment "${a.name}"`);
    }
    push(run.notes, rec, K.noteVectorMax);
  }

  for (const step of POST_PROCESS) step(run);
  return run;
}

/** Reads one difficulty of an lxchu chart into the same loaded score the c2s reader produces. */
export function parseLxchu(bytes: Uint8Array, options: ParseOptions, sourceName = ""): ParsedScore {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail(null, "the chart is not UTF-8 text");
  }
  const body = selectChart(text, options.difficulty);
  let run: ScoreRun;
  try {
    run = buildRun(body, options.mirror);
  } catch (cause) {
    if (cause instanceof ChartParseError) throw cause;
    return fail(null, cause instanceof Error ? cause.message : String(cause));
  }
  return {
    run,
    notes: run.notes.items.map(readScoreNote),
    canonical: canonicalizeScore(run),
    sourceName,
  };
}
