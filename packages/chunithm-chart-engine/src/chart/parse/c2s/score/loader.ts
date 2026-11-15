import { prepareBpm } from "../bpm";
import { commandCategory, readInteger, type CommandRecord } from "../commands";
import { HEADER_PATH_OFFSET, initializeHeader, readHeaderPass } from "../header";
import { setI32, u32, type ScoreRun } from "./common";
import { POST_PROCESS_STEPS } from "./postProcess";
import { produceNote, produceTimeline } from "./production";
import { Vec, applyStores, blob, cloneView } from "./storage";
import { K, LAYOUT, STORES } from "./tables";

export interface ScoreLoadOptions {
  mode: number;
  mirror: boolean;
  serialBase: number;
  path: Uint8Array;
  postCalls?: number;
}

export interface ScoreLoadResult {
  run: ScoreRun;
  header: DataView;
  nextSequence: number;
  serial: number;
  postProcessed: number;
}

export const POST_PROCESS_STEP_COUNT = POST_PROCESS_STEPS.length;

export function loadScore(
  tokens: readonly CommandRecord[],
  options: ScoreLoadOptions,
): ScoreLoadResult {
  const { mode, mirror, serialBase, path } = options;
  if (!Number.isInteger(mode) || mode < 0 || mode > 0xffffffff)
    throw new RangeError("加载模式必须是 uint32 整数");
  if (typeof mirror !== "boolean") throw new TypeError("必须显式给出镜像开关");
  if (!Number.isInteger(serialBase) || serialBase < 0 || serialBase > 0xffffffff)
    throw new RangeError("joint 序列号初值必须是 uint32 整数");
  const owner = blob(LAYOUT.owner.size);
  const strings = new Map<number, Uint8Array>();
  applyStores(owner, STORES.ownerConstructor);
  initializeHeader(owner, strings);
  setI32(owner, 0, mode);
  strings.set(HEADER_PATH_OFFSET, path.slice());
  let sequence = readHeaderPass(owner, strings, tokens);
  const header = cloneView(owner);
  const bpm = prepareBpm(owner, tokens, sequence, mode);
  const run: ScoreRun = {
    mirror,
    serial: serialBase,
    counter: 0,
    diagnostics: [],
    resolution: 0,
    bpm: new DataView(bpm.records.buffer, bpm.records.byteOffset, bpm.records.byteLength),
    timeline: { bpm: bpm.records, met: new Vec(), dcm: new Vec(), clk: new Vec(), map: new Map() },
    notes: new Vec(),
    lines: [new Vec(), new Vec(), new Vec(), new Vec()],
    clockLines: new Vec(),
    owner,
    strings,
  };
  let postProcessed = 0;
  const result = () => ({ run, header, nextSequence: sequence, serial: run.serial, postProcessed });
  if (bpm.skipped) return result();
  sequence = bpm.nextSequence;
  run.resolution = u32(owner, K.resolutionOffset);
  for (const t of tokens) {
    const category = commandCategory(t.id);
    let ok = false;
    if (category === 1) ok = produceTimeline(run, t, sequence);
    else if (category === 2) ok = produceNote(run, t, sequence);
    else if (category === 3) {
      const index = (t.id - K.categoryThreeFirstId) >>> 0;
      if (index < K.categoryThreeSlots) {
        setI32(owner, K.categoryThreeOffset + index * 4, readInteger(t, 1));
        ok = true;
      }
    }
    if (ok) sequence = (sequence + 1) >>> 0;
  }
  const calls = options.postCalls ?? 0;
  if (!Number.isInteger(calls) || calls < 0 || calls > POST_PROCESS_STEPS.length)
    throw new RangeError("后处理步骤数超出范围");
  for (; postProcessed < calls; postProcessed++) POST_PROCESS_STEPS[postProcessed](run);
  return result();
}
