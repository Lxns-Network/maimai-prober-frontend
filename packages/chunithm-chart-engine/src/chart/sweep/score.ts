import { add, divide, fromNumber, precisionBits, type ExtendedValue } from "../bind/x87";
import type { BakeEvent } from "../bake/events";
import type { NoteScore } from "../../notes/score";

const SCORE_SCALE = 1010000n;
const COMBO_LIMIT = 99999;
const PERCENT = 0.01;
const EMPTY_GAUGE_INCREMENT = 0.0001;
const GAUGE_CAPACITY = 12000;
/** Gauge gain per grade, in percent of a judgment's share. */
const GRADE_GAUGE_GAIN = [0, 10, 80, 100, 100];
/** Score weight per grade, in percent of a judgment's share. */
const GRADE_WEIGHT = [0, 50, 100, 101, 101];
const CATEGORY_WEIGHT = 100;
const CATEGORIES = 5;
const GRADES = 5;
/** Grade whose weight makes up the score denominator. */
const FULL_GRADE = 3;
/** Score category of each judgment type. */
const TYPE_CATEGORY = [0, 1, 2, 3, 0, 3, 4, 3, 3, 3, 3, 0, 3];
/** Gauge kind of each judgment type, and the gauge weight of each kind in percent. */
const TYPE_GAUGE_KIND = [0, 1, 2, 3, 4, 5, 6, 7, 5, 7, 7, 8, 7];
const GAUGE_KIND_WEIGHT = [100, 50, 50, 100, 100, 100, 100, 100, 100];
const TYPES = TYPE_CATEGORY.length;
const EXTENDED_BITS = precisionBits(0x37f);

/** Judgment types a record's notes contribute, with how many judgments each. */
function judgmentCounts(score: NoteScore): Uint32Array {
  const counts = new Uint32Array(TYPES);
  const add = (type: number, count: number) => {
    counts[type] = (counts[type] + count) >>> 0;
  };
  const flagged = (rows: readonly DataView[] | undefined) =>
    rows?.filter((row) => row.getUint8(0x14) !== 0).length ?? 0;
  score.records.forEach((record, index) => {
    const type = record.getInt32(0x10, true);
    if (type === 0 || type === 3 || type === 4 || type === 6 || type === 11) add(type, 1);
    else if (type === 1 || type === 2) {
      add(record.getUint8(0x8c) ? 4 : 0, 1);
      add(type, flagged(score.ticks?.get(index)));
    } else if (type === 9) add(9, score.ladders?.get(index)?.samples.length ?? 0);
    const attached = record.getInt32(0x14, true);
    if (attached === 3) add(3, 1);
    else if (attached === 5) {
      add(3, 1);
      add(5, flagged(score.secondaryTicks?.get(index)));
      add(7, (score.airHolds?.get(index)?.length ?? 0) + Number(record.getUint8(0x24) !== 0));
    } else if (attached === 8) {
      add(3, 1);
      add(8, flagged(score.secondaryTicks?.get(index)) + flagged(score.airSlides?.get(index)));
    }
  });
  return counts;
}

/** Judgment type of one committed judgment, from its record, the object it came from and its phase. */
function judgmentType(record: DataView, part: number, phase: number): number {
  if (part === 2) return 3;
  const type = record.getInt32(0x10, true);
  if (type === 1 || type === 2) return phase === 0 ? (record.getUint8(0x8c) ? 4 : 0) : type;
  if (type === 0 || type === 4 || type === 6 || type === 9 || type === 11) return type;
  throw new RangeError(`A judgment on a record of type ${type}`);
}

function store64(value: ExtendedValue): number {
  const rounded = add(value, fromNumber(0), 53);
  if (rounded.k === "zero") return rounded.s ? -0 : 0;
  if (rounded.k !== "fin") throw new RangeError("A finite gauge share is required");
  return (rounded.s ? -1 : 1) * Number(rounded.m) * 2 ** rounded.e;
}

/**
 * The score, combo and judgment counts after each judgment, in judgment order, each with the gauge as
 * it stands after every judgment of its step. Every judgment must carry the automatic play grade.
 */
export function scoreEvents(
  score: NoteScore,
  events: readonly BakeEvent[],
): Extract<BakeEvent, { kind: "score" }>[] {
  const counts = judgmentCounts(score);
  const perCategory = new Uint32Array(CATEGORIES);
  counts.forEach((count, type) => {
    perCategory[TYPE_CATEGORY[type]] = (perCategory[TYPE_CATEGORY[type]] + count) >>> 0;
  });
  const weight = (grade: number) => Math.imul(CATEGORY_WEIGHT, GRADE_WEIGHT[grade]) >>> 0;
  let denominator = 0;
  for (let category = 0; category < CATEGORIES; category++)
    denominator = (denominator + Math.imul(weight(FULL_GRADE), perCategory[category])) >>> 0;
  const scaled = (value: number, ceiling = false) => {
    let n = BigInt(value) * SCORE_SCALE;
    if (denominator !== 0) {
      if (ceiling) n += BigInt(denominator - 1);
      n /= BigInt(denominator);
    }
    return Number(n & 0xffffffffn);
  };

  const perKind = new Uint32Array(GAUGE_KIND_WEIGHT.length);
  counts.forEach((count, type) => {
    perKind[TYPE_GAUGE_KIND[type]] = (perKind[TYPE_GAUGE_KIND[type]] + count) >>> 0;
  });
  let gaugeWeights = 0;
  perKind.forEach((count, kind) => {
    gaugeWeights = GAUGE_KIND_WEIGHT[kind] * PERCENT * count + gaugeWeights;
  });
  const perWeight = store64(
    divide(fromNumber(GAUGE_CAPACITY), fromNumber(gaugeWeights), EXTENDED_BITS),
  );

  const graded = Array.from({ length: CATEGORIES }, () => new Uint32Array(GRADES));
  const weighted = new Uint32Array(CATEGORIES);
  let combo = 0;
  let gauge = 0;
  let gaugeEmpty = true;
  let scoreValue = 0;
  const out: Extract<BakeEvent, { kind: "score" }>[] = [];
  for (const event of events) {
    if (event.kind !== "judge") continue;
    if (event.result !== GRADES - 1)
      throw new RangeError(`Judgment of record ${event.note} has grade ${event.result}`);
    const grade = event.result;
    const type = judgmentType(score.records[event.note], event.part ?? 1, event.phase);
    const category = TYPE_CATEGORY[type];
    const counted = graded[category];
    if (counted[grade] !== 0xffffffff) {
      counted[grade]++;
      let value = 0;
      for (let g = 0; g < GRADES; g++) value = (value + Math.imul(weight(g), counted[g])) >>> 0;
      weighted[category] = value;
      let total = 0;
      for (let c = 0; c < CATEGORIES; c++) total = (total + weighted[c]) >>> 0;
      scoreValue = scaled(total);
    }
    combo = Math.min(combo >= 0xfffffffe ? 0xffffffff : combo + 1, COMBO_LIMIT);

    const share = GAUGE_KIND_WEIGHT[TYPE_GAUGE_KIND[type]] * PERCENT * perWeight;
    gauge += GRADE_GAUGE_GAIN[grade] * share * PERCENT;
    if (gaugeEmpty && gauge > 0) {
      gaugeEmpty = false;
      gauge += EMPTY_GAUGE_INCREMENT;
    }
    gauge = Math.max(0, Math.min(GAUGE_CAPACITY, gauge));
    if (gauge <= 0) gaugeEmpty = true;

    const sum = (g: number) => graded.reduce((n, row) => (n + row[g]) >>> 0, 0);
    out.push({
      kind: "score",
      time: event.time,
      score: scoreValue,
      combo,
      gauge,
      counts: [sum(4), sum(3), sum(2), (sum(0) + sum(1)) >>> 0],
    });
  }
  for (let i = out.length - 2; i >= 0; i--)
    if (out[i].time === out[i + 1].time) out[i].gauge = out[i + 1].gauge;
  return out;
}
