/**
 * The note layer: everything between a bound chart and a drawn note field, behind one `frame(step)`.
 *
 * It owns the pieces the frame needs that do not change while a chart plays (record plans, the
 * visible-interval table for the chosen speed, removal times, the band states) and the per-frame path
 * that turns a grid step into instances and bands and hands them to the renderer.
 */

import type { Pack } from "../assets/packFormat";
import { createNoteRenderer } from "./render/noteRenderer";
import type {
  DrawStats,
  NoteRenderer,
  NoteRendererOptions,
  FrameInput,
  NoteFrameOrder,
  PreparedNoteFrame,
} from "./render/types";
import type { PassSortMode } from "./render/drawGroups";
import { bandOrderOf } from "./bandOrder";
import { Timeline } from "../chart/timeline/reader";
import { createActiveSet, type ActiveSet } from "./active";
import { computeAppear, recordEndMs, stepsForScore, type VisibleIntervals } from "./appear";
import {
  bandColumnsOf,
  createBandAssembler,
  createBandStates,
  type BandInstance,
  type BandStates,
} from "./bandAssembler";
import { computeEnd } from "./end";
import { createModelStates, type ModelStates } from "./modelStates";
import { coverRuns, groundRunsOf } from "./groundRuns";
import { extapFrame, timelineFramesAt } from "./extapClock";
import { createMotionSupply } from "./motionSupply";
import { createMotionFrames, motionFramesOf } from "./motionFrames";
import type { MotionTracks } from "../chart/lifecycle/motion";
import type { ObjectLifetimes } from "../chart/lifecycle/nativeChart";
import { createLivePlayback, type LivePlaybackData } from "./livePlayback";
import { assertBakedSpeed } from "./bakedSpeed";
import {
  createEvaluateStore,
  evaluateInstances,
  type EvaluatedInstance,
  type JudgeVisibility,
} from "./evaluate";
import { buildRecordPlans, DEPTH_SCALE } from "./recordPlans";
import { bindHitDepth } from "./space";
import { speedForRowIndex } from "./tables";
import type { NoteScore } from "./score";
import { createAirSlideBandAssembler } from "./airSlideParts";
import { createLadderBandAssembler } from "./ladderAssembler";
import { createSlideBandAssembler } from "./slideAssembler";
import { computeJudgeVisibility } from "./visibility";

/** Frames the note clock advances per grid step. */
const FRAMES_PER_STEP = 0.5;
const INSTANCE_CAPACITY = 32768;
const BAND_VERTEX_CAPACITY = 65536;
const HOLD_BAND = "note/band/hold";
/** Fields of a record the layer reads: head time and tail time, both in milliseconds. */
const MILLISECONDS = 1000;

/** How each draw pass orders its members; passes not listed order by ascending key. */
const PASS_SORT_MODES: ReadonlyMap<number, PassSortMode> = new Map([
  [0, "depthDescending"],
  [2, "keyAscending"],
]);

/** A SLIDE or AIR band family's states, fed as they happen instead of read from the timeline. */
export interface LiveBandSink {
  /** The timeline segment the family's states come from. */
  readonly kind: "slide" | "airband";
  append(record: number, time: number, mode: number): void;
  clear(): void;
}

/**
 * Note states a player produces while the chart plays. The layer reads them in place of the ones
 * the timeline records; the timeline still decides which parts and bands each record has.
 */
export interface NoteLayerLive {
  modelStates: ModelStates;
  bandStates: BandStates;
  visibility: JudgeVisibility;
  /** Band families the layer draws; it adds them when built and removes them when disposed. */
  bands: Set<LiveBandSink>;
}

export interface NoteLayerInput {
  gl: WebGL2RenderingContext;
  strictResources?: boolean;
  pack: Pack;
  /** The bound chart: its records, scroll rows and timeline rows. */
  score: NoteScore;
  /** Plans already built for this score while selecting its texture resources. */
  recordPlans?: ReturnType<typeof buildRecordPlans>;
  /** The baked timeline; its `judge` rows give each record's removal and its `band` rows the band states. */
  timeline: Timeline;
  /** Frames of the animated parts; the timeline's `motion` rows when omitted. */
  motion?: MotionTracks;
  /** The steps each note object exists; records are drawn exactly then, and no visibility is scanned. */
  lifetimes?: ObjectLifetimes;
  /** Speed row the visible intervals are computed for. */
  speedRow: number;
  livePlayback?: LivePlaybackData;
  /** Maximum steps scanned on demand; omitted computes the full table at construction. */
  visibilityBlockSteps?: number;
  /** View-projection the notes are drawn with; replaceable with {@link NoteLayer.setViewProjection}. */
  viewProjection: Float32Array;
  /** Uploaded images by the name the pack records. */
  texturesByName?: ReadonlyMap<string, WebGLTexture>;
  /** Uploaded images by unit index, for a pack that records no names. */
  textures?: ReadonlyMap<number, WebGLTexture>;
  /** Borrowed renderer for an alternate layout using the same model resources; the caller owns it. */
  renderer?: NoteRenderer;
  /** States a player produces while the chart plays, read in place of the timeline's. */
  live?: NoteLayerLive;
  /** Steps each record stays drawable past its automatic run, for notes a player judges late. */
  liveSlack?: number;
}

export interface PreparedNoteLayerFrame extends PreparedNoteFrame {
  readonly notes: number;
}

export interface NoteLayer {
  readonly renderer: NoteRenderer;
  /** Grid steps the chart spans. */
  readonly steps: number;
  /**
   * Draws the notes present at grid step `step`. A step before the chart draws nothing.
   *
   * The caller owns the framebuffer: clearing it, the viewport and everything drawn before or after.
   */
  frame(step: number): DrawStats;
  prepare(step: number, order: NoteFrameOrder, presentationStep?: number): PreparedNoteLayerFrame;
  setViewProjection(matrix: Float32Array): void;
  setSpeed(row: number, multiplier?: number): void;
  /** Advances retained animation clocks without evaluating geometry for an inactive layout. */
  advance(step: number): void;
  /** Transfers renderer ownership to the caller; layer disposal then releases no GPU resources. */
  detachRenderer(): void;
  dispose(): void;
}

/** Each record's steps as the union of its objects' lifetimes, merged and in record order. */
function lifetimeIntervals(
  lifetimes: ObjectLifetimes,
  recordCount: number,
  row: number,
  steps: number,
): VisibleIntervals {
  const lists: [number, number][][] = Array.from({ length: recordCount }, () => []);
  for (let i = 0; i < lifetimes.records.length; i++) {
    const record = lifetimes.records[i];
    if (record >= recordCount)
      throw new RangeError(`Object ${i} names record ${record} of ${recordCount}`);
    if (lifetimes.removals[i] > lifetimes.spawns[i])
      lists[record].push([lifetimes.spawns[i], lifetimes.removals[i]]);
  }
  const intervals: number[] = [];
  const intervalCounts = new Uint32Array(recordCount);
  lists.forEach((list, record) => {
    list.sort((a, b) => a[0] - b[0]);
    let count = 0;
    for (const [start, end] of list) {
      if (count && start <= intervals[intervals.length - 1])
        intervals[intervals.length - 1] = Math.max(intervals[intervals.length - 1], end);
      else {
        intervals.push(start, end);
        count++;
      }
    }
    intervalCounts[record] = count;
  });
  return { row, steps, intervals: Int32Array.from(intervals), intervalCounts };
}

/**
 * Builds the layer. An explicit visibility block size defers scanning until the requested frame.
 * Only the current half-open block is retained; crossing a block boundary computes its replacement.
 *
 * @throws RangeError when the pack or the renderer rejects the chart's models or bands.
 */
export function createNoteLayer(input: NoteLayerInput): NoteLayer {
  return buildNoteLayer(input);
}

function buildNoteLayer(input: NoteLayerInput): NoteLayer {
  const { score, pack } = input;
  const timeline = input.livePlayback ? Timeline.from(input.livePlayback.timeline) : input.timeline;
  let speedRow = input.speedRow;
  let speedMultiplier = 1;
  const blockSteps = input.visibilityBlockSteps;
  if (blockSteps !== undefined && (!Number.isSafeInteger(blockSteps) || blockSteps < 1))
    throw new RangeError("Visibility block size must be a positive safe integer");
  const records = score.records;
  const { plans, meshMatrices, requiredModels } =
    input.recordPlans ?? buildRecordPlans(pack, score);
  const modelStates = input.live?.modelStates ?? createModelStates(timeline, records.length);
  const groundRuns = groundRunsOf(timeline, records.length);
  if (input.strictResources) {
    if (records.some((record) => record.getInt32(0x10, true) === 1) && !pack.entries.has(HOLD_BAND))
      throw new RangeError("The selected chart requires the HOLD band profile");
    for (const [index, plan] of plans.entries())
      if (
        (plan.air ||
          plan.airHold ||
          plan.airSlide ||
          plan.ladder?.some((element) => element !== null)) &&
        !modelStates.has(index)
      )
        throw new RangeError(
          `Record ${index} needs observed model states; rebake the chart timeline`,
        );
  }
  const motion = createMotionSupply(pack, {
    requiredModels: input.strictResources ? requiredModels : undefined,
  });

  if (input.strictResources && !input.livePlayback) assertBakedSpeed(timeline, input.speedRow);
  const recorded =
    !input.strictResources || input.livePlayback
      ? null
      : input.motion
        ? motionFramesOf(input.motion, input.speedRow)
        : createMotionFrames(timeline, input.speedRow);
  let motionFrames = recorded
    ? { animated: motion.animated, has: recorded.has, at: recorded.at }
    : undefined;

  const judgeTimes = timeline.column("judge", "time") as Float64Array;
  const judgeRecords = timeline.column("judge", "note") as Uint32Array;
  const visibility =
    input.live?.visibility ??
    computeJudgeVisibility({
      records,
      times: judgeTimes,
      notes: judgeRecords,
      phases: timeline.column("judge", "kind") as Uint8Array,
      parts: timeline.column("judge", "part") as Uint8Array,
    });
  const removal = computeEnd({
    judgeTimes,
    judgeRecords,
    isLong: () => false,
    endSeconds: (record) => recordEndMs(records[record]) / MILLISECONDS,
    recordCount: records.length,
  });

  const steps = stepsForScore(records);
  let fromStep = 0;
  let toStep = blockSteps === undefined ? steps + 1 : 0;
  let active: ActiveSet | null = input.livePlayback
    ? null
    : input.lifetimes
      ? createActiveSet(
          lifetimeIntervals(input.lifetimes, records.length, input.speedRow, steps),
          new Float64Array(records.length).fill(Infinity),
        )
      : blockSteps === undefined
        ? createActiveSet(
            coverRuns(computeAppear({ records, score, row: input.speedRow, steps }), groundRuns),
            removal,
          )
        : null;

  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(0x354, speedForRowIndex(input.speedRow), true);
  state.setFloat32(0x358, DEPTH_SCALE, true);
  const livePlayback = input.livePlayback
    ? createLivePlayback(score, input.livePlayback.runs, state, modelStates, input.liveSlack)
    : null;
  if (livePlayback)
    motionFrames = { animated: motion.animated, has: livePlayback.has, at: livePlayback.at };
  const setHitSpeed = input.livePlayback
    ? bindHitDepth(state, score, input.livePlayback.runs)
    : null;
  const store = createEvaluateStore(INSTANCE_CAPACITY);

  const options: NoteRendererOptions = {
    models: requiredModels,
    requiredModels: input.strictResources ? requiredModels : undefined,
    instanceCapacity: INSTANCE_CAPACITY,
    bandVertexCapacity: BAND_VERTEX_CAPACITY,
    passSortModes: PASS_SORT_MODES,
    viewProjection: input.viewProjection,
    textures: input.textures,
    texturesByName: input.texturesByName,
  };
  const slides = score.records.some((record) => record.getInt32(0x10, true) === 2)
    ? createSlideBandAssembler({ score, manager: state, pack, timeline })
    : null;
  const ladders = score.records.some((record) => record.getInt32(0x10, true) === 9)
    ? createLadderBandAssembler({ score, manager: state, pack, timeline })
    : null;
  const airSlides = score.airSlides?.size
    ? createAirSlideBandAssembler({ score, manager: state, pack, timeline })
    : null;
  const bandStates =
    input.live?.bandStates ?? createBandStates(bandColumnsOf(timeline), records.length);
  const liveBands: LiveBandSink[] = [];
  if (input.live)
    for (const [kind, family] of [
      ["slide", slides],
      ["airband", ladders],
      ["airband", airSlides],
    ] as const)
      if (family) {
        const sink: LiveBandSink = { kind, append: family.append, clear: family.clear };
        input.live.bands.add(sink);
        liveBands.push(sink);
      }
  const holdBand = pack.entries.get(HOLD_BAND);
  const assembler =
    holdBand && timeline.count("band") > 0
      ? createBandAssembler({
          score,
          manager: state,
          states: bandStates,
          profile: HOLD_BAND,
          ...bandOrderOf(pack, HOLD_BAND, "HOLD"),
          x87: "extended",
        })
      : null;
  const renderer = input.renderer ?? createNoteRenderer(input.gl, pack, options);
  let ownsRenderer = input.renderer === undefined;

  const instances: EvaluatedInstance[] = [];
  const bands: BandInstance[] = [];

  const evaluateFrame = (
    step: number,
    cameraPosition?: ArrayLike<number>,
    presentationStep = step,
  ): FrameInput => {
    if (step < 0 || step > steps || !Number.isFinite(step)) {
      instances.length = 0;
      bands.length = 0;
      return { instances, bands };
    }
    step = Math.trunc(step);
    if (
      !livePlayback &&
      !input.lifetimes &&
      blockSteps !== undefined &&
      (active === null || step < fromStep || step >= toStep)
    ) {
      const nextFrom = Math.floor(step / blockSteps) * blockSteps;
      const nextTo = Math.min(nextFrom + blockSteps, steps + 1);
      const intervals = coverRuns(
        computeAppear({
          records,
          score,
          row: input.speedRow,
          steps,
          fromStep: nextFrom,
          toStep: nextTo,
        }),
        groundRuns,
      );
      const nextActive = createActiveSet(intervals, removal);
      active = nextActive;
      fromStep = nextFrom;
      toStep = nextTo;
    }
    if (!livePlayback) active!.advanceTo(step);
    const ids = livePlayback ? livePlayback.records : active!.records();
    const count = livePlayback
      ? livePlayback.update(step, speedRow, speedMultiplier)
      : active!.count();
    const nowFrames = Math.fround(presentationStep * FRAMES_PER_STEP);
    state.setFloat32(0x300, nowFrames, true);
    const written = evaluateInstances(
      {
        state,
        score,
        meshMatrices,
        plans,
        records: ids,
        count,
        nowFrames,
        bandStates,
        visibility,
        modelStates,
        strictClocks: input.strictResources,
        motionFrames,
        step: livePlayback ? presentationStep : step,
        cameraPosition,
      },
      store,
    );
    instances.length = written;
    for (let i = 0; i < written; i++) instances[i] = store.instances[i];
    if (assembler || slides || ladders || airSlides) {
      const buffer = renderer.bands();
      if (assembler) assembler.assemble(step, nowFrames, ids, count, buffer, bands);
      else {
        buffer.reset();
        bands.length = 0;
      }
      slides?.assemble(step, nowFrames, ids, count, buffer, bands);
      ladders?.assemble(step, nowFrames, ids, count, buffer, bands);
      airSlides?.assemble(step, nowFrames, ids, count, buffer, bands);
    }
    return {
      instances,
      bands: assembler || slides || ladders || airSlides ? bands : [],
      animationFrame: extapFrame(timelineFramesAt(state, score), {
        paused: false,
        frameDelta: FRAMES_PER_STEP,
      }),
      animationFrameOf: motion.at(timelineFramesAt(state, score), {
        paused: false,
        frameDelta: FRAMES_PER_STEP,
      }),
    };
  };

  const visibleRecords = new Set<number>();
  return {
    renderer,
    steps,
    frame(step) {
      if (step < 0 || step > steps || !Number.isFinite(step))
        return { draws: 0, instances: 0, bandVertices: 0, cpuMs: 0 };
      return renderer.frame(evaluateFrame(step));
    },
    prepare(step, order, presentationStep = step) {
      const frame = evaluateFrame(step, order.cameraPosition, presentationStep);
      visibleRecords.clear();
      for (const instance of instances) visibleRecords.add(instance.record);
      for (const band of bands) visibleRecords.add(band.record);
      return { ...renderer.prepare(frame, order), notes: visibleRecords.size };
    },
    setSpeed(row, multiplier = 1) {
      if (!livePlayback) throw new Error("Live speed data is unavailable");
      state.setFloat32(0x354, speedForRowIndex(row) * multiplier, true);
      speedRow = row;
      speedMultiplier = multiplier;
      setHitSpeed!(multiplier);
    },
    advance(step) {
      if (step >= 0 && step <= steps)
        livePlayback?.update(Math.trunc(step), speedRow, speedMultiplier);
    },
    setViewProjection(matrix) {
      renderer.setViewProjection(matrix);
    },
    detachRenderer() {
      ownsRenderer = false;
    },
    dispose() {
      for (const sink of liveBands) input.live!.bands.delete(sink);
      if (ownsRenderer) renderer.dispose();
      ownsRenderer = false;
    },
  };
}
