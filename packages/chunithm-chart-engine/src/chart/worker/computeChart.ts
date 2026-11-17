import type { LivePlaybackData } from "../../notes/livePlayback";
import type { ChartRequest, ChartAnswer, ChartEffects } from "./protocol";
import { parseC2s, ChartParseError } from "../parse/parseChart";
import { isLxchu, parseLxchu } from "../parse/lxchu";
import { bindScore } from "../bind/bindScore";
import { compileJudgeTimingIni, JUDGE_TIMING_BYTES } from "../bind/config";
import { bake } from "../bake/bake";
import { lookupPositionTime } from "../parse/c2s/position";
import { nativeChart } from "../lifecycle/nativeChart";

import type { BoundScore } from "../bind/bindScore";
import { spawnSteps } from "../lifecycle/spawnStep";
import { noteObjects } from "../lifecycle/objects";
import { lifecycleRuns } from "../lifecycle/runs";
import { lifecycleContext } from "../lifecycle/context";
import { assembleEvents } from "../lifecycle/emissions";
import { noteScoreOf } from "../../notes/score";
import { effectSweep } from "../sweep/effects";

/** Highest difficulty row the judge-window binding distinguishes. */
const MAX_BIND_DIFFICULTY = 3;

function bindRequest({ bytes, config, difficulty, mirror }: ChartRequest): BoundScore {
  if (!bytes || !config) throw new RangeError("No chart has been sent to this worker");
  const chart = new Uint8Array(bytes);
  const parse = isLxchu(chart) ? parseLxchu : parseC2s;
  const parsed = parse(chart, { difficulty, mirror });
  let timing: DataView = new DataView(config);
  if (config.byteLength !== JUDGE_TIMING_BYTES) {
    const bytes = new Uint8Array(config);
    if (!/^\s*\[[A-Z][A-Z.]+\]/.test(new TextDecoder("shift_jis").decode(bytes)))
      throw new RangeError("Unsupported judge configuration format");
    timing = compileJudgeTimingIni(bytes);
  }
  return bindScore(parsed, timing, {
    difficulty: Math.min(difficulty, MAX_BIND_DIFFICULTY),
    mirror,
  });
}

/** Runs parse, bind and every note lifecycle for one request and returns the reply with its transfer list. */
export function handleChartRequest(data: ChartRequest): ChartAnswer {
  return answer(
    data,
    () => bindRequest(data),
    false,
    () => bindRequest({ ...data, mirror: !data.mirror }),
  );
}

/**
 * A request handler that keeps the chart it bound last, so requests without `bytes` run further speed
 * rows of it. Records shared with the kept binding are copied into the reply rather than transferred.
 */
export function createChartHandler(): (data: ChartRequest) => ChartAnswer {
  let kept: BoundScore | null = null;
  let mirrored: BoundScore | null = null;
  return (data) =>
    answer(
      data,
      () => {
        if (data.bytes) {
          kept = null;
          kept = bindRequest(data);
          mirrored = data.includeMirror ? bindRequest({ ...data, mirror: !data.mirror }) : null;
        }
        if (!kept) throw new RangeError("No chart has been sent to this worker");
        return kept;
      },
      true,
      () => {
        if (!mirrored) throw new RangeError("No mirrored chart has been prepared");
        return mirrored;
      },
    );
}

function answer(
  data: ChartRequest,
  bindChart: () => BoundScore,
  keepBound: boolean,
  bindMirror: () => BoundScore,
): ChartAnswer {
  const { id, musicId, speedRow = 0 } = data;
  try {
    const bound = bindChart();
    const chart = nativeChart(bound, speedRow, data.judgeTimingRow);
    const lastMeasure = bound.parsed.notes.reduce(
      (last, note) => Math.max(last, note.start.measure, note.end.measure, note.airEnd.measure),
      0,
    );
    const position = new DataView(new ArrayBuffer(12));
    const measureTimesMs = Array.from({ length: Math.ceil(lastMeasure) + 2 }, (_, measure) => {
      position.setFloat32(0, measure, true);
      return lookupPositionTime(position, bound.parsed.run.bpm);
    });
    const timeline = bake(bound, () => chart.events, {
      musicId,
      defaultSpeedRow: speedRow,
      measureTimesMs,
    });
    if (!data.includeScore) return { message: { id, ok: true, timeline }, transfer: [timeline] };
    const { score, motion, lifetimes } = chart;
    const context = lifecycleContext(bound, data.judgeTimingRow);
    const runs = lifecycleRuns(
      score,
      noteObjects(score.records, spawnSteps(score, 0, chart.steps)),
      context,
    );
    const livePlayback: LivePlaybackData = {
      timeline: bake(bound, () => assembleEvents(runs), { musicId }),
      runs,
    };
    const effects: ChartEffects = {
      instances: chart.effects.instances,
      consumption: chart.effects.consumption,
      moves: chart.effects.moves,
    };
    const mirrored = data.includeMirror
      ? (() => {
          const score = noteScoreOf(bindMirror());
          const sweep = effectSweep({
            score,
            runs: chart.runs,
            events: assembleEvents(chart.runs),
            steps: chart.steps,
          });
          return {
            score,
            effects: {
              instances: sweep.instances,
              consumption: sweep.consumption,
              moves: sweep.moves,
            },
          };
        })()
      : undefined;
    const buffers = new Set<ArrayBuffer>([timeline, livePlayback.timeline]);
    for (const layout of mirrored ? [score, mirrored.score] : [score])
      for (const view of [
        ...(keepBound ? [] : layout.records),
        layout.scroll,
        ...(layout.barTimes ? [layout.barTimes] : []),
        ...layout.timeline.values(),
        ...[...(layout.slideJoints?.values() ?? [])].flat(),
      ])
        buffers.add(view.buffer as ArrayBuffer);
    for (const array of [
      motion.records,
      motion.parts,
      motion.models,
      motion.firsts,
      motion.offsets,
      motion.frames,
      lifetimes.records,
      lifetimes.spawns,
      lifetimes.removals,
      ...Object.values(effects.instances),
      ...Object.values(effects.consumption),
      ...Object.values(effects.moves),
      ...(mirrored
        ? [
            ...Object.values(mirrored.effects.instances),
            ...Object.values(mirrored.effects.consumption),
            ...Object.values(mirrored.effects.moves),
          ]
        : []),
    ])
      buffers.add(array.buffer as ArrayBuffer);
    return {
      message: {
        id,
        ok: true,
        timeline,
        score,
        motion,
        lifetimes,
        effects,
        livePlayback,
        mirrored,
      },
      transfer: [...buffers],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      message: {
        id,
        ok: false,
        error: {
          name: err instanceof ChartParseError ? "ChartParseError" : err.name,
          message: err.message,
          line: err instanceof ChartParseError ? err.line : null,
        },
      },
      transfer: [],
    };
  }
}
