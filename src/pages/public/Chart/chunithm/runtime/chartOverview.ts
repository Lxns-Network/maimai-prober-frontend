import type { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import type { NoteScore } from "@lxns-network/chunithm-chart-engine/notes/score";
import type { DensityNote } from "../../components/ChartDensityTimeline/ChartDensityTimeline";

export function createChartOverview(timeline: Timeline, score: NoteScore) {
  const times = timeline.column("judge", "time");
  const judgedRecords = timeline.column("judge", "note");
  const parts = timeline.column("judge", "part");
  const densityNotes: DensityNote[] = Array.from(times, (time, index) => {
    const type = score.records[judgedRecords[index]].getInt32(0x10, true);
    return {
      timingMs: time * 1000,
      type:
        parts[index] === 2 || type === 9
          ? "air"
          : type === 1
            ? "hold"
            : type === 2
              ? "slide"
              : type === 6
                ? "flick"
                : "tap",
    };
  });
  return { notes: densityNotes, measureTimesMs: timeline.meta.measureTimesMs ?? [] };
}
