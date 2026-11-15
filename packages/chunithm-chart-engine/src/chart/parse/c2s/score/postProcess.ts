import { fitLanes } from "./laneFit";
import { fround, truncateToInt32 } from "../float32";
import { sortPositionRecords } from "../introsort";
import { lookupPositionTime, writePosition } from "../position";
import {
  J40,
  J50,
  SAMPLES,
  T148,
  T158,
  copyPos,
  f32,
  floorAnyF,
  floorF,
  i32,
  lastOf,
  realWidth,
  setF32,
  setI32,
  u32,
  u32ToF32,
  widthIndex,
  type ScoreRun,
} from "./common";
import { retimeSamples, sampleJoints } from "./production";
import { Vec, applyStores, blob, cloneView, push, subView, type NoteRecord } from "./storage";
import { F, LAYOUT, PF, PK, SORT_STRIDES, STATS, T, TICK_CONSTRUCTOR } from "./tables";

function sortByStride(stride: number, view: DataView): void {
  if (!SORT_STRIDES.includes(stride)) throw new Error(`没有步长为 ${stride} 的排序实例`);
  sortPositionRecords(view, stride);
}

const floorI = (x: number) => truncateToInt32(fround(floorF(x) + F.half));

function tickI(x: number): number {
  const t = floorI(x);
  if (t === -2147483648) throw new RangeError("位置换算为 tick 时溢出");
  return t;
}

const center = (lane: number, w: number) =>
  fround(fround(lane) + fround(fround(realWidth(w)) * F.half));
const beat = (v: DataView, o: number) => fround(fround(f32(v, o) * F.beatScale) + f32(v, o + 4));
const tick384 = (v: DataView, o: number) =>
  fround(fround(fround(f32(v, o + 4) * F.quarter) + f32(v, o)) * PF.tick384);
const tickSum = (v: DataView, o: number) =>
  fround(fround(f32(v, o + 4) * PF.tick96) + fround(f32(v, o) * PF.tick384));
const lookup = (run: ScoreRun, v: DataView, o: number) =>
  lookupPositionTime(subView(v, o, 12), run.bpm);
const bpmCount = (run: ScoreRun) => run.bpm.byteLength / LAYOUT.bpm.size;
const tutorial = (run: ScoreRun) => run.owner.getUint8(PK.tutorialOffset) !== 0;

function bpmAt(run: ScoreRun, t: number): number {
  const n = bpmCount(run);
  if (!n) throw new RangeError("BPM 记录为空");
  for (let i = n - 1; i >= 0; i--)
    if (!(f32(run.bpm, i * LAYOUT.bpm.size + 8) > t)) return f32(run.bpm, i * LAYOUT.bpm.size + 16);
  return f32(run.bpm, 16);
}

function judgeInterval(run: ScoreRun, bpm: number): number {
  const limit = fround(f32(run.owner, PK.progJudgeBpmOffset) * F.beatScale);
  let interval = PK.judgeBase;
  while (limit > bpm) {
    const next = fround(bpm + bpm);
    if (next === bpm) throw new RangeError("判定间隔减半循环无法结束");
    bpm = next;
    interval = (interval / 2) | 0;
  }
  return interval;
}

function stopAt(run: ScoreRun, t: number): boolean {
  const vec = run.timeline.map.get(0);
  if (!vec) return false;
  for (const e of vec.items) {
    if (!(f32(e, 8) < t)) return false;
    if (t >= f32(e, 0x1c)) continue;
    if (f32(e, 0x10) === 0) return true;
  }
  return false;
}

const pushTick = (vec: Vec<DataView>, tk: DataView) => push(vec, cloneView(tk), PK.tickVectorMax);

function sortVec(vec: Vec<DataView>, stride: number): void {
  const n = vec.items.length;
  const buf = new Uint8Array(n * stride);
  vec.items.forEach((x, i) => buf.set(new Uint8Array(x.buffer, x.byteOffset, stride), i * stride));
  sortByStride(stride, new DataView(buf.buffer));
  vec.items = vec.items.map((_, i) => new DataView(buf.buffer.slice(i * stride, (i + 1) * stride)));
}

const isChainType = (type: number) => type === 2 || (type - 9) >>> 0 <= 1;

function normalizeWidths(run: ScoreRun): void {
  for (const n of run.notes.items) {
    const v = n.view;
    const type = i32(v, 0x10);
    if (isChainType(type)) {
      setI32(v, 0x2c, widthIndex(realWidth(i32(v, 0x2c))));
      const J = n.vectors[J40].items;
      if (J.length >= 1) {
        const j = J[J.length - 1];
        setI32(j, 0x20, widthIndex(realWidth(i32(j, 0x20))));
      }
      if (type === 9 || type === 10) {
        sampleJoints(run, n, i32(v, 0x6c));
        retimeSamples(run, n);
      }
    }
    if (i32(v, 0x14) === 8)
      for (const j of n.vectors[J50].items)
        if (j.getUint8(0x14)) setI32(j, 0x20, widthIndex(realWidth(i32(j, 0x20))));
  }
}

function holdTicks(run: ScoreRun, n: NoteRecord): void {
  const v = n.view;
  const ticks = n.vectors[T148];
  const R = run.resolution;
  ticks.items = [];
  const Rf = u32ToF32(R);
  const endT = tickI(fround(fround(fround(f32(v, 0x34) * F.quarter) + f32(v, 0x30)) * Rf));
  const startT = tickI(fround(fround(fround(f32(v, 4) * F.quarter) + f32(v, 0)) * Rf));
  const length = (endT - startT) | 0;
  if (length < 0) throw new RangeError("Hold 长度为负，超出支持范围");
  let acc = judgeInterval(run, bpmAt(run, f32(v, 8)));
  const tk = blob(LAYOUT.tick.size);
  setF32(tk, 0x1c, PF.tickDepth);
  setF32(tk, 0x18, center(i32(v, 0x28), i32(v, 0x2c)));
  for (;;) {
    tk.setUint8(0x14, 1);
    if (acc >>> 0 < length >>> 0) {
      setI32(tk, 0x10, PK.kindHoldMid);
      const t = (tickI(tickSum(v, 0)) + acc) | 0;
      writePosition(subView(tk, 0, 12), 0, t >>> 0, R);
      setF32(tk, 8, lookup(run, tk, 0));
      if (tutorial(run) && stopAt(run, f32(tk, 8))) tk.setUint8(0x14, 0);
    } else {
      copyPos(tk, 0, v, 0x30);
      setI32(tk, 0x10, PK.kindHoldEnd);
    }
    pushTick(ticks, tk);
    if (i32(tk, 0x10) === PK.kindHoldEnd) return;
    acc = (acc + judgeInterval(run, bpmAt(run, f32(tk, 8)))) | 0;
  }
}

function slideTicks(run: ScoreRun, n: NoteRecord): void {
  const v = n.view;
  const ticks = n.vectors[T148];
  const R = run.resolution;
  ticks.items = [];
  const tk = blob(LAYOUT.tick.size);
  setF32(tk, 0x1c, PF.tickDepth);
  const cur = blob(12);
  copyPos(cur, 0, v, 0);
  const J = n.vectors[J40].items;
  for (let k = 0; k < J.length; k++) {
    const prev = k === 0 ? v : J[k - 1];
    const po = 0;
    const pCenter =
      k === 0 ? center(i32(v, 0x28), i32(v, 0x2c)) : center(i32(prev, 0x10), i32(prev, 0x20));
    const j = J[k];
    const cCenter = center(i32(j, 0x10), i32(j, 0x20));
    const jTickF = tick384(j, 0);
    const pTickF = tick384(prev, po);
    const seg = (tickI(jTickF) - tickI(pTickF)) | 0;
    const interval = judgeInterval(run, bpmAt(run, f32(prev, 8)));
    tk.setUint8(0x14, 1);
    if (k === 0) {
      writePosition(cur, 0, ((tickI(pTickF) + interval) | 0) >>> 0, R);
      setF32(cur, 8, lookup(run, cur, 0));
    } else if (J[k - 1].getUint8(0x14)) {
      copyPos(tk, 0, prev, 0);
      setF32(tk, 0x18, pCenter);
      setI32(tk, 0x10, PK.kindSlideControl);
      pushTick(ticks, tk);
      writePosition(cur, 0, ((tickI(pTickF) + interval) | 0) >>> 0, R);
      setF32(cur, 8, lookup(run, cur, 0));
    }
    setI32(tk, 0x10, PK.kindSlideMid);
    let tickF = tick384(cur, 0);
    if (tickI(tickF) < tickI(jTickF)) {
      const pI = tickI(pTickF);
      const inv = fround(F.one / u32ToF32(seg));
      do {
        copyPos(tk, 0, cur, 0);
        tk.setUint8(0x14, 1);
        const jI = tickI(jTickF);
        const tI = tickI(tickF);
        const a = fround(fround((jI - tI) | 0) * pCenter);
        const b = fround(fround((tI - pI) | 0) * cCenter);
        setF32(tk, 0x18, fround(fround(b + a) * inv));
        if (tutorial(run) && stopAt(run, f32(tk, 8))) tk.setUint8(0x14, 0);
        pushTick(ticks, tk);
        const iv = judgeInterval(run, bpmAt(run, f32(cur, 8)));
        writePosition(cur, 0, ((tickI(tickF) + iv) | 0) >>> 0, R);
        setF32(cur, 8, lookup(run, cur, 0));
        tickF = tick384(cur, 0);
      } while (tickI(tickF) < tickI(jTickF));
    }
  }
  const last = lastOf(n.vectors[J40]);
  copyPos(tk, 0, last, 0);
  setI32(tk, 0x10, PK.kindSlideEnd);
  tk.setUint8(0x14, 1);
  setF32(tk, 0x18, center(i32(last, 0x10), i32(last, 0x20)));
  pushTick(ticks, tk);
}

function airHoldTicks(run: ScoreRun, n: NoteRecord): void {
  const v = n.view;
  const ticks = n.vectors[T158];
  const R = run.resolution;
  ticks.items = [];
  const J = n.vectors[J50].items;
  const segments = J.length + 1;
  const starts: DataView[] = [];
  const ends: DataView[] = [];
  for (let s = 0; s < segments; s++) {
    starts.push(s === 0 ? subView(v, 0x30, 12) : subView(J[s - 1], 0, 12));
    ends.push(s < J.length ? subView(J[s], 0, 12) : subView(v, 0x18, 12));
  }
  const tk = blob(LAYOUT.tick.size);
  const primary = i32(v, 0x10) === 2 && n.vectors[J40].items.length;
  const anchor = primary ? lastOf(n.vectors[J40]) : null;
  setF32(
    tk,
    0x18,
    anchor ? center(i32(anchor, 0x10), i32(anchor, 0x20)) : center(i32(v, 0x28), i32(v, 0x2c)),
  );
  setF32(tk, 0x1c, fround(i32(v, 0x9c)));
  for (let s = 0; s < segments; s++) {
    const start = starts[s];
    const end = ends[s];
    const startTickF = tick384(start, 0);
    const length = (tickI(tick384(end, 0)) - tickI(startTickF)) | 0;
    if (length < 0) throw new RangeError("AIR Hold 分段长度为负，超出支持范围");
    let acc = judgeInterval(run, bpmAt(run, f32(start, 8)));
    if (s !== 0) {
      copyPos(tk, 0, start, 0);
      setI32(tk, 0x10, PK.kindAirControl);
      tk.setUint8(0x14, 0);
      pushTick(ticks, tk);
    }
    setI32(tk, 0x10, PK.kindAirMid);
    let first = 1;
    if (acc >>> 0 < length >>> 0) {
      const base = tickI(startTickF);
      do {
        writePosition(subView(tk, 0, 12), 0, ((base + acc) | 0) >>> 0, R);
        setF32(tk, 8, lookup(run, tk, 0));
        tk.setUint8(0x14, first ^ 1);
        pushTick(ticks, tk);
        acc = (acc + judgeInterval(run, bpmAt(run, f32(tk, 8)))) | 0;
        first = 0;
      } while (acc >>> 0 < length >>> 0);
    }
  }
  copyPos(tk, 0, v, 0x18);
  setI32(tk, 0x10, PK.kindAirEnd);
  tk.setUint8(0x14, 0);
  pushTick(ticks, tk);
}

function airSlideTicks(run: ScoreRun, n: NoteRecord): void {
  const v = n.view;
  const ticks = n.vectors[T158];
  const R = run.resolution;
  ticks.items = [];
  const cur = blob(12);
  copyPos(cur, 0, v, 0x30);
  const type = i32(v, 0x10);
  const onJoint = type === 2 || (type > 8 && type <= 10);
  const anchor = onJoint ? lastOf(n.vectors[J40]) : null;
  let pCenter = anchor
    ? center(i32(anchor, 0x10), i32(anchor, 0x20))
    : center(i32(v, 0x28), i32(v, 0x2c));
  const pHeight = fround(i32(v, 0x9c));
  const tk = blob(LAYOUT.tick.size);
  applyStores(tk, TICK_CONSTRUCTOR);
  let first = 1;
  const J = n.vectors[J50].items;
  let prev = v;
  let po = 0x30;
  for (let k = 0; k < J.length; k++) {
    if (k) {
      prev = J[k - 1];
      po = 0;
      pCenter = center(i32(prev, 0x10), i32(prev, 0x20));
    }
    const j = J[k];
    const cCenter = center(i32(j, 0x10), i32(j, 0x20));
    const cHeight = fround(i32(j, 0x18));
    const jI = tickI(tick384(j, 0));
    const pI = tickI(tick384(prev, po));
    const seg = (jI - pI) | 0;
    const interval = judgeInterval(run, bpmAt(run, f32(prev, po + 8)));
    if (k === 0) {
      writePosition(cur, 0, ((interval + pI) | 0) >>> 0, R);
      setF32(cur, 8, lookup(run, cur, 0));
    } else if (J[k - 1].getUint8(0x14)) {
      copyPos(tk, 0, prev, 0);
      setF32(tk, 0x18, pCenter);
      setF32(tk, 0x1c, pHeight);
      setI32(tk, 0x10, PK.kindAirControl);
      tk.setUint8(0x14, 0);
      pushTick(ticks, tk);
      writePosition(cur, 0, ((interval + pI) | 0) >>> 0, R);
      setF32(cur, 8, lookup(run, cur, 0));
      first = 1;
    }
    let dl = first;
    setI32(tk, 0x10, PK.kindAirMid);
    let tI = tickI(tick384(cur, 0));
    if (tI < jI) {
      const inv = fround(F.one / u32ToF32(seg));
      do {
        copyPos(tk, 0, cur, 0);
        const a = fround((jI - tI) | 0);
        const b = fround((tI - pI) | 0);
        tk.setUint8(0x14, dl === 0 ? 1 : 0);
        setF32(tk, 0x18, fround(fround(fround(b * cCenter) + fround(pCenter * a)) * inv));
        setF32(tk, 0x1c, fround(fround(fround(b * cHeight) + fround(pHeight * a)) * inv));
        if (tutorial(run) && stopAt(run, f32(tk, 8))) tk.setUint8(0x14, 0);
        pushTick(ticks, tk);
        const iv = judgeInterval(run, bpmAt(run, f32(cur, 8)));
        writePosition(cur, 0, ((iv + tI) | 0) >>> 0, R);
        setF32(cur, 8, lookup(run, cur, 0));
        dl = 0;
        tI = tickI(tick384(cur, 0));
      } while (tI < jI);
      first = dl;
    }
  }
  const last = lastOf(n.vectors[J50]);
  copyPos(tk, 0, last, 0);
  setI32(tk, 0x10, PK.kindAirEnd);
  tk.setUint8(0x14, 0);
  setF32(tk, 0x18, center(i32(last, 0x10), i32(last, 0x20)));
  setF32(tk, 0x1c, fround(i32(last, 0x18)));
  pushTick(ticks, tk);
}

function tickFlags(run: ScoreRun, n: NoteRecord): void {
  const v = n.view;
  const A = n.vectors[T148].items;
  const B = n.vectors[T158].items;
  if (!A.length && !B.length) return;
  const secondary = i32(v, 0x14);
  const tut = tutorial(run);
  const late = (t: DataView, threshold: number, aer: number) => {
    const iv = judgeInterval(run, bpmAt(run, f32(t, 8)));
    const x = floorI(tickSum(t, 0));
    const y = truncateToInt32(floorF(fround(fround(iv) * aer)));
    return ((x + y) | 0) >= threshold;
  };
  if (secondary === 3 || secondary === 5 || secondary === 8) {
    if (tut) for (const t of A) t.setUint8(0x14, 0);
    const aer = f32(run.owner, PK.progJudgeAerOffset);
    if (aer >= 0 && A.length)
      for (const t of A) if (late(t, floorI(tickSum(A[A.length - 1], 0)), aer)) t.setUint8(0x14, 0);
  }
  let open = false;
  if (secondary === 5) open = v.getUint8(0x24) === 0;
  else if (secondary === 8) open = lastOf(n.vectors[J50]).getUint8(0x14) === 0;
  const aer = f32(run.owner, PK.progJudgeAerOffset);
  if (open && aer >= 0) {
    const threshold = floorI(tickSum(v, 0x18));
    for (const t of B) if (late(t, threshold, aer)) t.setUint8(0x14, 0);
  }
  if (tut) for (const t of [...A, ...B]) if (stopAt(run, f32(t, 8))) t.setUint8(0x14, 0);
}

function buildTicks(run: ScoreRun): void {
  for (const n of run.notes.items) {
    const type = i32(n.view, 0x10);
    if (type === 1) holdTicks(run, n);
    else if (type === 2) slideTicks(run, n);
    const secondary = i32(n.view, 0x14);
    if (secondary === 5) airHoldTicks(run, n);
    else if (secondary === 8) airSlideTicks(run, n);
    tickFlags(run, n);
  }
}

function slaAt(run: ScoreRun, pv: DataView, po: number, lane: number, width: number): number {
  let result = 0;
  for (const s of run.notes.items) {
    const sv = s.view;
    if (i32(sv, 0x10) !== PK.typeSla) continue;
    const count = i32(sv, 0x70);
    const sLane = i32(sv, 0x28);
    const sWidth = realWidth(i32(sv, 0x2c));
    if (result >= count) continue;
    const a = beat(sv, 0);
    const b = fround(beat(pv, po) + F.nearEpsilon);
    if (!(b >= a)) continue;
    if (b >= beat(sv, 0x30)) continue;
    if (lane < sLane) continue;
    if (((lane + width) | 0) <= ((sLane + sWidth) | 0)) result = count;
  }
  return result;
}

interface SlaSource {
  view: DataView;
  off: number;
}

function assignSla(run: ScoreRun): void {
  let src: SlaSource | null = null;
  let src2: SlaSource | null = null;
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
    setI32(v, 0x70, src ? slaAt(run, src.view, src.off, lane1, width1) : 0);
    setI32(v, 0x74, src2 ? slaAt(run, src2.view, src2.off, lane2, width2) : 0);
  }
}

function findLastPositions(run: ScoreRun): void {
  const o = run.owner;
  const L = PK.lastNoteOffset;
  const E = PK.lastEventOffset;
  for (let i = 0; i < 12; i += 4) {
    setI32(o, L + i, 0);
    setI32(o, E + i, 0);
  }
  const take = (dst: number, src: DataView, so: number) => {
    if (!(fround(beat(o, dst) + F.nearEpsilon) >= beat(src, so))) copyPos(o, dst, src, so);
  };
  for (const n of run.notes.items) {
    const v = n.view;
    const type = i32(v, 0x10);
    if (type >>> 0 <= PK.lastPathMaxType) {
      const path = T.lastPath[type];
      if (path === 0) take(L, v, 0);
      else if (path === 1) take(L, v, 0x30);
      else if (path === 2 && n.vectors[J40].items.length) take(L, lastOf(n.vectors[J40]), 0);
    }
    const secondary = i32(v, 0x14);
    if (secondary === 5) take(L, v, 0x18);
    else if (secondary === 8 && n.vectors[J50].items.length) take(L, lastOf(n.vectors[J50]), 0);
  }
  copyPos(o, E, o, L);
  for (let i = 0; i < bpmCount(run); i++) take(E, run.bpm, i * LAYOUT.bpm.size);
  for (const m of run.timeline.met.items) take(E, m, 0);
  for (const key of [...run.timeline.map.keys()].sort((a, b) => a - b))
    for (const e of run.timeline.map.get(key)!.items) take(E, e, 0);
  for (const e of run.timeline.dcm.items) take(E, e, 0);
  for (const e of run.timeline.clk.items) take(E, e, 0);
}

function bpmStatistics(run: ScoreRun): void {
  const o = run.owner;
  const n = bpmCount(run);
  const B = LAYOUT.bpm.size;
  if (!n) return;
  sortByStride(B, run.bpm);
  const first = u32(run.bpm, 16);
  for (const off of PK.bpmStatOffsets) setI32(o, off, first);
  if (n === 1) return;
  const totals = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const next = i === n - 1 ? f32(o, PK.lastEventOffset + 8) : f32(run.bpm, (i + 1) * B + 8);
    const duration = fround(next - f32(run.bpm, i * B + 8));
    const bpm = f32(run.bpm, i * B + 16);
    if (bpm > f32(o, PK.bpmMaxOffset)) setF32(o, PK.bpmMaxOffset, bpm);
    if (f32(o, PK.bpmMinOffset) > bpm) setF32(o, PK.bpmMinOffset, bpm);
    const key = truncateToInt32(floorF(fround(fround(bpm * PF.bpmKeyScale) + F.half)));
    const total = totals.get(key);
    totals.set(key, total !== undefined ? fround(total + duration) : duration);
  }
  const keys = [...totals.keys()].sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) if (totals.get(k)! > totals.get(best)!) best = k;
  setF32(o, PK.bpmModeOffset, fround(fround(best) * PF.bpmKeyUnscale));
}

function buildLines(run: ScoreRun): void {
  const o = run.owner;
  const max = PK.lineVectorMax;
  let R = run.resolution;
  if (R === 0) R = PK.judgeBase;
  const Rf = u32ToF32(R);
  const tickOf = (v: DataView, off: number) =>
    floorI(fround(fround(fround(f32(v, off + 4) * F.quarter) + f32(v, off)) * Rf));
  const at = (t: number, e: DataView) => {
    writePosition(subView(e, 0, 12), Math.floor((t >>> 0) / R), (t >>> 0) % R, R);
    setF32(e, 8, lookup(run, e, 0));
  };
  for (const L of run.lines) L.items = [];
  const met = run.timeline.met;
  sortVec(met, LAYOUT.met.size);
  if (met.items.length >= 2) {
    let i = 0;
    while (i + 1 < met.items.length) {
      const a = beat(met.items[i], 0);
      const b = beat(met.items[i + 1], 0);
      if (!(fround(a + F.nearEpsilon) >= b) || !(fround(b + F.nearEpsilon) >= a)) {
        i++;
        continue;
      }
      met.items.splice(i, 1);
    }
  }
  const local = met.items.map(cloneView);
  if (!local.length || tickOf(local[0], 0) !== 0) {
    const e = blob(LAYOUT.met.size);
    setI32(e, 0x10, i32(o, PK.metDefOffsets[0]));
    setI32(e, 0x14, i32(o, PK.metDefOffsets[1]));
    local.unshift(e);
  }
  const lastT = floorI(
    fround(
      fround(fround(f32(o, PK.lastEventOffset + 4) * F.quarter) + f32(o, PK.lastEventOffset)) * Rf,
    ),
  );
  const count = (Math.floor((lastT >>> 0) / R) + 2) >>> 0;
  for (let i = 0; i >>> 0 < count; i++) {
    const e = blob(LAYOUT.line.size);
    writePosition(subView(e, 0, 12), i >>> 0, 0, R);
    setF32(e, 8, lookup(run, e, 0));
    setI32(e, 0x10, i);
    push(run.lines[0], e, max);
  }
  const quarter = Math.trunc((R | 0) / 4) | 0;
  let counter = 0;
  const bars = run.lines[0].items;
  for (let k = 0; k < bars.length; k++) {
    const L = bars[k];
    const nextT = k + 1 < bars.length ? tickOf(bars[k + 1], 0) : lastT;
    const e = blob(LAYOUT.line.size);
    copyPos(e, 0, L, 0);
    setI32(e, 0x10, counter);
    push(run.lines[1], e, max);
    counter = (counter + 1) | 0;
    let subIndex = 1;
    for (let t = (tickOf(L, 0) + quarter) | 0; t < nextT; t = (t + quarter) | 0) {
      const d = blob(LAYOUT.line.size);
      setI32(d, 0x14, subIndex);
      setI32(d, 0x10, counter);
      at(t, d);
      push(run.lines[1], d, max);
      subIndex++;
      counter = (counter + 1) | 0;
    }
  }
  const measures: { line: DataView; met: DataView }[] = [];
  let c2 = 0;
  if (local.length) {
    const endT = (Math.imul((Math.floor((lastT >>> 0) / R) + 1) | 0, R | 0) + 1) | 0;
    for (let k = 0; k < local.length; k++) {
      const m = local[k];
      const nextT = k + 1 < local.length ? tickOf(local[k + 1], 0) : endT;
      const line = blob(LAYOUT.line.size);
      copyPos(line, 0, m, 0);
      setI32(line, 0x10, c2);
      measures.push({ line, met: m });
      c2 = (c2 + 1) | 0;
      const lower = u32(m, 0x10);
      const upper = u32(m, 0x14);
      if (upper === 0 || lower === 0) break;
      const step = Math.floor((Math.imul(upper, R) >>> 0) / lower) >>> 0;
      for (let t = (tickOf(m, 0) + step) | 0; t < nextT; t = (t + step) | 0) {
        const d = blob(LAYOUT.line.size);
        setI32(d, 0x10, c2);
        at(t, d);
        measures.push({ line: d, met: m });
        c2 = (c2 + 1) | 0;
      }
    }
  }
  for (const x of measures) push(run.lines[2], cloneView(x.line), max);
  let c3 = 0;
  for (let k = 0; k < measures.length; k++) {
    const x = measures[k];
    const nextT = k + 1 < measures.length ? tickOf(measures[k + 1].line, 0) : lastT;
    const e = blob(LAYOUT.line.size);
    copyPos(e, 0, x.line, 0);
    setI32(e, 0x10, c3);
    push(run.lines[3], e, max);
    c3 = (c3 + 1) | 0;
    const lower = u32(x.met, 0x10);
    const upper = u32(x.met, 0x14);
    if (upper === 0 || lower === 0) break;
    const step = Math.floor((R >>> 0) / lower) >>> 0;
    let subIndex = 1;
    for (let t = (tickOf(x.line, 0) + step) | 0; t < nextT; t = (t + step) | 0) {
      const d = blob(LAYOUT.line.size);
      setI32(d, 0x14, subIndex);
      setI32(d, 0x10, c3);
      at(t, d);
      push(run.lines[3], d, max);
      c3 = (c3 + 1) | 0;
      subIndex++;
    }
  }
}

function sortTimelineMap(run: ScoreRun): void {
  for (const key of [...run.timeline.map.keys()].sort((a, b) => a - b))
    sortVec(run.timeline.map.get(key)!, LAYOUT.timelineEvent.size);
}

function sortDcm(run: ScoreRun): void {
  sortVec(run.timeline.dcm, LAYOUT.dcm.size);
}

function buildClockLines(run: ScoreRun): void {
  const v = run.clockLines;
  const o = run.owner;
  v.items = [];
  if (run.resolution === 0) throw new RangeError("分辨率为 0");
  const at = blob(12);
  writePosition(at, 0, u32(o, PK.clockDefOffset), run.resolution);
  const threshold = beat(at, 0);
  for (const line of run.lines[1].items) {
    if (!(threshold > fround(beat(line, 0) + F.nearEpsilon))) break;
    const e = blob(LAYOUT.owner108.size);
    copyPos(e, 0, line, 0);
    push(v, e, PK.clockVectorMax);
  }
  for (const c of run.timeline.clk.items) push(v, cloneView(c), PK.clockVectorMax);
  sortVec(v, LAYOUT.owner108.size);
}

function retimeAll(run: ScoreRun): void {
  for (const m of run.timeline.met.items) setF32(m, 8, lookup(run, m, 0));
  for (const c of run.timeline.clk.items) setF32(c, 8, lookup(run, c, 0));
  for (const L of run.lines) for (const l of L.items) setF32(l, 8, lookup(run, l, 0));
  for (const n of run.notes.items) {
    const v = n.view;
    const type = i32(v, 0x10);
    setF32(v, 8, lookup(run, v, 0));
    setF32(v, 0x38, lookup(run, v, 0x30));
    if (type === 2 || (type - 9) >>> 0 < 2) {
      for (const j of n.vectors[J40].items) setF32(j, 8, lookup(run, j, 0));
      if (type === 9) {
        sampleJoints(run, n, i32(v, 0x6c));
        retimeSamples(run, n);
      }
    }
    const secondary = i32(v, 0x14);
    if (secondary === 5 || secondary === 8) {
      for (const j of n.vectors[J50].items) setF32(j, 8, lookup(run, j, 0));
      setF32(v, 0x20, lookup(run, v, 0x18));
    }
  }
}

function writeStatistics(run: ScoreRun): void {
  const o = run.owner;
  const ST = STATS;
  for (let a = ST.clear.begin; a < ST.clear.end; a += 4) setI32(o, a, 0);
  const inc = (off: number, by = 1) => setI32(o, off, (i32(o, off) + by) | 0);
  const D: DataView[] = [];
  const add = (v: DataView, off: number) => {
    const e = blob(12);
    copyPos(e, 0, v, off);
    D.push(e);
  };
  const flagged = (items: DataView[]) => items.filter((x) => x.getUint8(0x14)).length;
  const duration = (v: DataView, a: number, b: number) =>
    truncateToInt32(floorF(fround(f32(v, a) - f32(v, b))));
  const direction = (v: DataView) => {
    inc(ST.directionTotal);
    const d = i32(v, 0x88);
    if (d >>> 0 <= 7) inc(ST.directionBase + 4 * d);
  };
  for (const n of run.notes.items) {
    const v = n.view;
    const type = i32(v, 0x10);
    const P = type >>> 0 <= 11 ? ST.primary[type] : undefined;
    let air = false;
    if (P) {
      if (P.kind === "samples") {
        const smp = n.vectors[SAMPLES].items;
        for (const off of P.count!) inc(off, smp.length);
        for (const x of smp) add(x, 0);
      } else {
        for (const off of P.inc!) inc(off);
        if (P.kind === "slide") {
          const J = n.vectors[J40].items;
          inc(P.jointCount!, J.length);
          inc(P.flaggedJointCount!, flagged(J));
        }
        add(v, 0);
        if (P.kind === "hold" || P.kind === "slide") {
          const d = duration(v, 0x38, 8);
          if (d > 0) inc(P.duration!, d);
          if (v.getUint8(0x8c)) air = true;
          else inc(ST.groundLong);
          inc(ST.judgeTotal);
          const Tk = n.vectors[T148].items;
          inc(P.ticks!, flagged(Tk));
          for (const t of Tk) if (t.getUint8(0x14)) add(t, 0);
        } else if (P.kind === "chr") air = true;
      }
    }
    if (air) direction(v);
    const secondary = i32(v, 0x14);
    if (secondary === 3) {
      for (const off of ST.air) inc(off);
      add(v, 0x30);
    } else if (secondary === 5 || secondary === 8) {
      const J = n.vectors[J50].items;
      const Tk = n.vectors[T158].items;
      const count = secondary === 5 ? J.length + (v.getUint8(0x24) ? 1 : 0) : flagged(J);
      for (const off of ST.airLong.count) inc(off, count);
      for (const off of ST.airLong.once) inc(off);
      const d = duration(v, 0x20, 0x38);
      if (d > 0) inc(ST.airLong.duration, d);
      inc(ST.airLong.judge);
      add(v, 0);
      inc(ST.airLong.judge, flagged(Tk));
      for (const t of Tk) if (t.getUint8(0x14)) add(t, 0);
      inc(ST.airLong.judge, secondary === 8 ? flagged(J) : J.length);
      for (const j of J) add(j, 0);
      if (secondary === 5 && v.getUint8(0x24)) {
        inc(ST.airLong.judge);
        add(v, 0x18);
      }
    }
  }
  if (D.length) {
    const buf = new Uint8Array(D.length * 12);
    D.forEach((e, i) => buf.set(new Uint8Array(e.buffer), i * 12));
    const view = new DataView(buf.buffer);
    sortByStride(12, view);
    const first = subView(view, 0, 12);
    const last = subView(view, (D.length - 1) * 12, 12);
    setI32(o, ST.span, truncateToInt32(floorF(f32(first, 8))));
    setI32(o, ST.span + 4, floorI(tickSum(first, 0)));
    setI32(o, ST.span + 8, truncateToInt32(floorF(f32(last, 8))));
    setI32(o, ST.span + 12, floorI(tickSum(last, 0)));
    const range = fround(f32(last, 8) - f32(first, 8));
    for (let i = 0; i < D.length; i++) {
      const x = fround(
        fround(fround(f32(view, i * 12 + 8) - f32(first, 8)) / range) * PF.densityBins,
      );
      let bin = truncateToInt32(floorAnyF(x));
      if (bin < 0) bin = 0;
      if (bin >= ST.densityBins) bin = ST.densityBins - 1;
      inc(ST.density + 4 * bin);
    }
  }
  for (const [total, first, count] of ST.totals) {
    let acc = i32(o, total);
    for (let i = 0; i < count; i++) acc = (acc + i32(o, first + 4 * i)) | 0;
    setI32(o, total, acc);
  }
}

export const POST_PROCESS_STEPS: readonly ((run: ScoreRun) => void)[] = [
  normalizeWidths,
  fitLanes,
  buildTicks,
  assignSla,
  findLastPositions,
  bpmStatistics,
  buildLines,
  sortTimelineMap,
  sortDcm,
  buildClockLines,
  retimeAll,
  writeStatistics,
];

export const POST_PROCESS_STEP_INDEX = {
  normalizeWidths: POST_PROCESS_STEPS.indexOf(normalizeWidths),
  fitLanes: POST_PROCESS_STEPS.indexOf(fitLanes),
  buildTicks: POST_PROCESS_STEPS.indexOf(buildTicks),
  assignSla: POST_PROCESS_STEPS.indexOf(assignSla),
  findLastPositions: POST_PROCESS_STEPS.indexOf(findLastPositions),
  bpmStatistics: POST_PROCESS_STEPS.indexOf(bpmStatistics),
  buildLines: POST_PROCESS_STEPS.indexOf(buildLines),
  sortTimelineMap: POST_PROCESS_STEPS.indexOf(sortTimelineMap),
  sortDcm: POST_PROCESS_STEPS.indexOf(sortDcm),
  buildClockLines: POST_PROCESS_STEPS.indexOf(buildClockLines),
  retimeAll: POST_PROCESS_STEPS.indexOf(retimeAll),
  writeStatistics: POST_PROCESS_STEPS.indexOf(writeStatistics),
} as const;
