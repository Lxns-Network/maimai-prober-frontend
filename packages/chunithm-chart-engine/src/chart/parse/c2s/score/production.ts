import { bitsToFloat, fround, truncateToInt32 } from "../float32";
import { readFloatBits, readInteger, type CommandRecord } from "../commands";
import { lookupPositionTime, writePosition } from "../position";
import {
  J40,
  J50,
  SAMPLES,
  clampWidth,
  copyPos,
  cstr,
  differs,
  enumIndex,
  f32,
  floorF,
  i32,
  lastOf,
  noteIndex,
  noteType,
  position,
  realWidth,
  scaled10,
  setF32,
  setI32,
  tailLane,
  tailWidth,
  token,
  u32,
  u32ToF32,
  validSecondary,
  widthIndex,
  type ScoreRun,
} from "./common";
import {
  Vec,
  applyStores,
  blob,
  cloneView,
  copyNote,
  newNote,
  push,
  subView,
  type NoteRecord,
} from "./storage";
import { F, K, LAYOUT, STORES, T } from "./tables";

function newJoint(run: ScoreRun, rec: NoteRecord): DataView {
  const j = blob(LAYOUT.joint.size);
  run.serial = (run.serial + 1) >>> 0;
  applyStores(j, STORES.jointConstructor, { width: u32(rec.view, 0x2c), serial: run.serial });
  return j;
}

const pushJoint = (vec: Vec<DataView>, j: DataView) => push(vec, cloneView(j), K.jointVectorMax);

function pushNote(run: ScoreRun, rec: NoteRecord): void {
  push(run.notes, copyNote(rec), K.noteVectorMax, (vec) => {
    vec.items = vec.items.map(copyNote);
  });
}

export function sampleJoints(run: ScoreRun, rec: NoteRecord, step: number): void {
  const samples = rec.vectors[SAMPLES];
  samples.items = [];
  const joints = rec.vectors[J40].items;
  if (!joints.length) return;
  setI32(rec.view, 0x6c, step);
  if (step <= 0) return;
  const res = u32ToF32(run.resolution);
  const tickOf = (v: DataView) =>
    truncateToInt32(
      fround(floorF(fround(fround(fround(f32(v, 4) * F.quarter) + f32(v, 0)) * res)) + F.half),
    );
  const startTick = tickOf(rec.view);
  const endTick = tickOf(joints[joints.length - 1]);
  if (endTick <= startTick) return;
  let prevLane = fround(i32(rec.view, 0x28));
  let prevHeight = fround(fround(i32(rec.view, 0x9c)) * F.tenth);
  let prevWidth = fround(realWidth(i32(rec.view, 0x2c)));
  let prevTick = startTick;
  let tick = startTick;
  let j = 0;
  const emit = (lane: number, height: number, width: number, at: number) => {
    const s = blob(LAYOUT.sample.size);
    applyStores(s, STORES.sampleConstructor);
    if (run.resolution === 0) throw new RangeError("分辨率为 0");
    writePosition(
      subView(s, 0, 12),
      Math.floor((at >>> 0) / run.resolution),
      (at >>> 0) % run.resolution,
      run.resolution,
    );
    setF32(s, 0x10, lane);
    setF32(s, 0x14, height);
    setF32(s, 0x18, width);
    s.setUint8(0x1c, K.sampleFlag);
    push(samples, s, K.sampleVectorMax);
  };
  while (tick < endTick) {
    if (j >= joints.length) throw new Error("joint 采样循环无法结束");
    let emitted = false;
    while (j < joints.length) {
      const joint = joints[j];
      const jt = tickOf(joint);
      if (tick < jt && prevTick !== jt) {
        const t = fround(fround((tick - prevTick) | 0) / fround((jt - prevTick) | 0));
        const lane = fround(fround(fround(fround(i32(joint, 0x10)) - prevLane) * t) + prevLane);
        const height = fround(
          fround(fround(fround(fround(i32(joint, 0x18)) * F.tenth) - prevHeight) * t) + prevHeight,
        );
        const width = fround(
          fround(fround(fround(realWidth(i32(joint, 0x20))) - prevWidth) * t) + prevWidth,
        );
        emit(lane, height, width, tick);
        tick = (tick + step) | 0;
        emitted = true;
        break;
      }
      prevLane = fround(i32(joint, 0x10));
      prevTick = jt;
      prevHeight = fround(fround(i32(joint, 0x18)) * F.tenth);
      prevWidth = fround(realWidth(i32(joint, 0x20)));
      j++;
    }
    if (!emitted && j >= joints.length) throw new Error("joint 采样循环无法结束");
  }
  if (tick !== endTick) return;
  const last = joints[joints.length - 1];
  emit(
    fround(i32(last, 0x10)),
    fround(fround(i32(last, 0x18)) * F.tenth),
    fround(realWidth(i32(last, 0x20))),
    endTick,
  );
}

export function retimeSamples(run: ScoreRun, rec: NoteRecord): void {
  for (const s of rec.vectors[SAMPLES].items)
    setF32(s, 8, lookupPositionTime(subView(s, 0, 12), run.bpm));
}

export function produceNote(run: ScoreRun, t: CommandRecord, sequence: number): boolean {
  const int = (i: number) => readInteger(t, i);
  const type = noteType(token(t, 0));
  if (type >>> 0 > K.maxType) return false;
  const rec = newNote();
  const v = rec.view;
  setI32(v, 0x10, type);
  position(run, v, 0x00, int(1), int(2));
  copyPos(v, 0x30, v, 0x00);
  setI32(v, 0x28, int(3));
  const w = clampWidth(int(4));
  setI32(v, 0x2c, widthIndex(w));
  if (run.mirror) setI32(v, 0x28, (K.mirrorBase - w - i32(v, 0x28)) | 0);
  setI32(v, 0x78, sequence);
  const lane = i32(v, 0x28);
  const width = i32(v, 0x2c);
  const id = t.id;
  const two = () => {
    setI32(v, 0x7c, run.counter);
    setI32(v, 0x80, run.counter + 1);
    run.counter = (run.counter + 2) | 0;
  };
  const mirrorJoint = (j: DataView) => {
    if (run.mirror) setI32(j, 0x10, (K.mirrorBase - i32(j, 0x10) - realWidth(i32(j, 0x20))) | 0);
  };
  switch (type) {
    case 0:
    case 4:
    case 6:
    case 11:
      setI32(v, 0x7c, run.counter);
      run.counter = (run.counter + 1) | 0;
      if (type === 4) setI32(v, 0x88, enumIndex("chrDirection", token(t, 5)));
      pushNote(run, rec);
      return true;
    case 1:
      two();
      if (id === K.idHld) v.setUint8(0x8c, 0);
      else if (id === K.idHxd) {
        v.setUint8(0x8c, 1);
        setI32(v, 0x88, enumIndex("chrDirection", token(t, 6)));
      }
      position(run, v, 0x30, int(1), (int(2) + int(5)) | 0);
      pushNote(run, rec);
      return true;
    case 12:
      two();
      setI32(v, 0x70, int(6));
      position(run, v, 0x30, int(1), (int(2) + int(5)) | 0);
      pushNote(run, rec);
      return true;
    case 2: {
      two();
      position(run, v, 0x30, int(1), (int(2) + int(5)) | 0);
      const j = newJoint(run, rec);
      setI32(j, 0x10, int(6));
      if (t.tokens.length > K.slideWidthColumn) setI32(j, 0x20, widthIndex(clampWidth(int(7))));
      mirrorJoint(j);
      copyPos(j, 0, v, 0x30);
      if (id === K.idSld) {
        v.setUint8(0x8c, 0);
        j.setUint8(0x14, 1);
      } else if (id === K.idSxd) {
        v.setUint8(0x8c, 1);
        setI32(v, 0x88, enumIndex("chrDirection", token(t, 9)));
        j.setUint8(0x14, 1);
      } else if (id === K.idSlc) {
        v.setUint8(0x8c, 0);
        j.setUint8(0x14, 0);
      } else if (id === K.idSxc) {
        v.setUint8(0x8c, 1);
        setI32(v, 0x88, enumIndex("chrDirection", token(t, 9)));
        j.setUint8(0x14, 0);
      }
      const group = enumIndex("slideGroup", token(t, 8));
      for (const n of run.notes.items) {
        const joints = n.vectors[J40];
        if (i32(n.view, 0x10) !== 2 || !joints.items.length || i32(n.view, 0x98) !== group)
          continue;
        const last = lastOf(joints);
        if (i32(last, 0x10) !== lane || i32(last, 0x20) !== width || differs(last, 0, v, 0))
          continue;
        pushJoint(joints, j);
        copyPos(n.view, 0x30, v, 0x30);
        return true;
      }
      pushJoint(rec.vectors[J40], j);
      setI32(v, 0x98, group);
      pushNote(run, rec);
      return true;
    }
    case 9: {
      two();
      position(run, v, 0x30, int(1), (int(2) + int(7)) | 0);
      const startHeight = scaled10(t, 6);
      const j = newJoint(run, rec);
      setI32(j, 0x10, int(8));
      setI32(j, 0x20, widthIndex(clampWidth(int(9))));
      setI32(j, 0x18, scaled10(t, 10));
      setI32(v, 0x94, enumIndex("color", token(t, 11)));
      mirrorJoint(j);
      copyPos(j, 0, v, 0x30);
      j.setUint8(0x14, 0);
      const step = int(5);
      for (const n of run.notes.items) {
        const joints = n.vectors[J40];
        if (
          i32(n.view, 0x10) !== 9 ||
          !joints.items.length ||
          i32(n.view, 0x6c) !== step ||
          i32(n.view, 0x94) !== i32(v, 0x94)
        )
          continue;
        const last = lastOf(joints);
        if (
          i32(last, 0x10) !== lane ||
          i32(last, 0x20) !== width ||
          differs(last, 0, v, 0) ||
          i32(last, 0x18) !== startHeight
        )
          continue;
        pushJoint(joints, j);
        sampleJoints(run, n, step);
        retimeSamples(run, n);
        copyPos(n.view, 0x30, v, 0x30);
        return true;
      }
      pushJoint(rec.vectors[J40], j);
      setI32(v, 0x9c, startHeight);
      sampleJoints(run, rec, step);
      retimeSamples(run, rec);
      pushNote(run, rec);
      return true;
    }
    case 10: {
      two();
      position(run, v, 0x30, int(1), (int(2) + int(7)) | 0);
      const hA = scaled10(t, 5);
      const hB = scaled10(t, 6);
      const j = newJoint(run, rec);
      setI32(j, 0x10, int(8));
      setI32(j, 0x20, widthIndex(clampWidth(int(9))));
      setI32(j, 0x18, scaled10(t, 10));
      setI32(j, 0x1c, scaled10(t, 11));
      const color = enumIndex("color", token(t, 12));
      setI32(v, 0x94, color);
      mirrorJoint(j);
      copyPos(j, 0, v, 0x30);
      j.setUint8(0x14, 0);
      for (const n of run.notes.items) {
        const joints = n.vectors[J40];
        if (i32(n.view, 0x10) !== 10 || !joints.items.length || i32(n.view, 0x94) !== color)
          continue;
        const last = lastOf(joints);
        if (
          i32(last, 0x10) !== lane ||
          i32(last, 0x20) !== width ||
          differs(last, 0, v, 0) ||
          i32(last, 0x18) !== hA ||
          i32(last, 0x1c) !== hB
        )
          continue;
        pushJoint(joints, j);
        n.vectors[SAMPLES].items = [];
        if (joints.items.length) setI32(n.view, 0x6c, 0);
        retimeSamples(run, n);
        copyPos(n.view, 0x30, v, 0x30);
        return true;
      }
      pushJoint(rec.vectors[J40], j);
      setI32(v, 0x9c, hA);
      setI32(v, 0xa0, hB);
      rec.vectors[SAMPLES].items = [];
      if (rec.vectors[J40].items.length) setI32(v, 0x6c, 0);
      pushNote(run, rec);
      return true;
    }
    case 3: {
      const parent = noteType(token(t, 5));
      for (const n of run.notes.items) {
        if (
          validSecondary(i32(n.view, 0x14)) ||
          tailLane(n) !== lane ||
          tailWidth(n) !== width ||
          differs(n.view, 0x30, v, 0) ||
          i32(n.view, 0x10) !== parent
        )
          continue;
        setI32(n.view, 0x14, type);
        setI32(n.view, 0x84, run.counter);
        setI32(n.view, 0x94, enumIndex("airColor", token(t, 6)));
        const index = noteIndex(cstr(token(t, 0)));
        const row =
          (index - K.airDirectionFirst) >>> 0 <= K.airDirectionLast
            ? index - K.airDirectionFirst + 1
            : 0;
        setI32(n.view, 0x90, T.airDirection[row][run.mirror ? 1 : 0]);
        run.counter = (run.counter + 1) | 0;
        return true;
      }
      run.diagnostics.push({ sequence, kind: "air-parent-missing" });
      return false;
    }
    case 5: {
      const parent = noteType(token(t, 5));
      const flag = id === K.idAhd ? 1 : 0;
      const end = blob(12);
      position(run, end, 0, int(1), (int(2) + int(6)) | 0);
      for (const n of run.notes.items) {
        const tl = tailLane(n);
        if (tl !== lane || tailWidth(n) !== width) continue;
        if (i32(n.view, 0x14) === 5 && parent === 5) {
          if (differs(n.view, 0x18, v, 0)) continue;
          if (n.view.getUint8(0x24) !== 0) {
            const j = newJoint(run, rec);
            copyPos(j, 0, n.view, 0x18);
            setI32(j, 0x10, tl);
            pushJoint(n.vectors[J50], j);
          }
          copyPos(n.view, 0x18, end, 0);
          n.view.setUint8(0x24, flag);
          return true;
        }
        if (
          i32(n.view, 0x10) !== parent ||
          differs(n.view, 0x30, v, 0) ||
          validSecondary(i32(n.view, 0x14))
        )
          continue;
        setI32(n.view, 0x94, enumIndex("airColor", token(t, 7)));
        setI32(n.view, 0x14, type);
        copyPos(n.view, 0x18, end, 0);
        n.view.setUint8(0x24, flag);
        if (i32(n.view, 0x84) < 0) {
          setI32(n.view, 0x84, run.counter);
          run.counter = (run.counter + 1) | 0;
        }
        return true;
      }
      run.diagnostics.push({ sequence, kind: "air-hold-parent-missing" });
      return false;
    }
    case 8: {
      const startHeight = scaled10(t, 6);
      const j = newJoint(run, rec);
      position(run, j, 0, int(1), (int(2) + int(7)) | 0);
      setI32(j, 0x10, int(8));
      setI32(j, 0x20, widthIndex(int(9)));
      setI32(j, 0x18, scaled10(t, 10));
      j.setUint8(0x14, id === K.idAsd ? 1 : 0);
      mirrorJoint(j);
      const index = noteIndex(cstr(token(t, 5)));
      if (index === K.chainAsd || index === K.chainAsc) {
        const chainFlag = index === K.chainAsd ? 1 : 0;
        for (const n of run.notes.items) {
          const joints = n.vectors[J50];
          if (i32(n.view, 0x14) !== 8 || !joints.items.length) continue;
          const last = lastOf(joints);
          if (
            differs(last, 0, v, 0) ||
            i32(last, 0x10) !== lane ||
            i32(last, 0x20) !== width ||
            i32(last, 0x18) !== startHeight ||
            last.getUint8(0x14) !== chainFlag
          )
            continue;
          pushJoint(joints, j);
          copyPos(n.view, 0x18, j, 0);
          return true;
        }
      } else {
        const parent = noteType(token(t, 5));
        for (const n of run.notes.items) {
          if (
            i32(n.view, 0x10) !== parent ||
            differs(n.view, 0x30, v, 0) ||
            tailLane(n) !== lane ||
            tailWidth(n) !== width ||
            i32(n.view, 0x14) !== -1
          )
            continue;
          setI32(n.view, 0x14, type);
          setI32(n.view, 0x9c, startHeight);
          setI32(n.view, 0x94, enumIndex("airColor", token(t, 11)));
          pushJoint(n.vectors[J50], j);
          copyPos(n.view, 0x18, j, 0);
          if (i32(n.view, 0x84) < 0) {
            setI32(n.view, 0x84, run.counter);
            run.counter = (run.counter + 1) | 0;
          }
          return true;
        }
      }
      run.diagnostics.push({ sequence, kind: "air-slide-parent-missing" });
      return false;
    }
    default:
      return false;
  }
}

export function produceTimeline(run: ScoreRun, t: CommandRecord, sequence: number): boolean {
  const int = (i: number) => readInteger(t, i);
  const fl = (i: number) => bitsToFloat(readFloatBits(t, i));
  const start = (elem: DataView) => position(run, elem, 0, int(1), int(2));
  const endAt = (elem: DataView) => position(run, elem, 0x14, int(1), (int(2) + int(3)) | 0);
  switch (t.id) {
    case K.idMet: {
      const e = blob(LAYOUT.met.size);
      applyStores(e, STORES.metConstructor);
      start(e);
      setI32(e, 0x10, int(3));
      setI32(e, 0x14, int(4));
      setI32(e, 0x0c, sequence);
      push(run.timeline.met, e, K.metVectorMax);
      return true;
    }
    case K.idStp:
    case K.idSfl:
    case K.idSlp:
    case K.idDcm: {
      const e = blob(LAYOUT.timelineEvent.size);
      applyStores(e, t.id === K.idDcm ? STORES.dcmConstructor : STORES.eventConstructor);
      start(e);
      if (t.id === K.idStp) setI32(e, 0x10, 0);
      else setF32(e, 0x10, fl(4));
      endAt(e);
      setI32(e, 0x0c, sequence);
      if (t.id === K.idDcm) {
        push(run.timeline.dcm, e, K.eventVectorMax);
        return true;
      }
      const key = t.id === K.idSlp ? int(5) : 0;
      let vec = run.timeline.map.get(key);
      if (!vec) {
        vec = new Vec<DataView>();
        vec.items.push(e);
        vec.cap = 1;
        run.timeline.map.set(key, vec);
      } else {
        push(vec, e, K.mapVectorMax);
      }
      return true;
    }
    case K.idClk: {
      const e = blob(LAYOUT.clk.size);
      applyStores(e, STORES.clkConstructor);
      start(e);
      setI32(e, 0x0c, sequence);
      push(run.timeline.clk, e, K.clkVectorMax);
      return true;
    }
    default:
      return false;
  }
}
