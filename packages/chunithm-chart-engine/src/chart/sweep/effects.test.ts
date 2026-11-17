import { describe, expect, it } from "vitest";
import { parseLxchu } from "../parse/lxchu";
import { bindScore } from "../bind/bindScore";
import { noteScoreOf } from "../../notes/score";
import { effectSweep, EFFECT_GROUP } from "./effects";
import type { ObjectRun } from "../lifecycle/emissions";

const directions = ["up", "down", "center", "rcircle", "lcircle", "rside", "lside", "both"];
const resources = [14, 15, 16, 18, 17, 20, 19, 21];

// B10AA0 native dispatch captures: local resource22; directional row0..7 uses resource14..21.
describe("EX directional effects", () => {
  it.each([false, true])(
    "preserves chart directions on TAP and long heads with mirror=%s",
    (mirror) => {
      const lines = directions.flatMap((direction, i) => [
        `tap ${i * 1152 + 384} 2-5 ex ${direction}`,
        `hold ${i * 1152 + 768}..${i * 1152 + 864} 2-5 ex ${direction}`,
        `slide ${i * 1152 + 960} 2-5 ex ${direction} -> ${i * 1152 + 1056} 6-9`,
      ]);
      const bytes = new TextEncoder().encode(
        ["&format=lxchu/1", "&id=1", "&chart_3=", "bpm 0 120", ...lines, ""].join("\n"),
      );
      const parsed = parseLxchu(bytes, { difficulty: 3, mirror });
      const bound = bindScore(parsed, new DataView(new ArrayBuffer(0xb0c)), {
        difficulty: 3,
        mirror,
      });
      const score = noteScoreOf(bound);
      const runs: ObjectRun[] = score.records.map((_record, i) => ({
        object: {
          record: i,
          className: (["CharaTapNote", "HoldNote", "SlideNote"] as const)[i % 3],
          slot: 8,
          spawn: i * 100,
          order: i,
        },
        removal: i * 100 + 90,
        judges: [{ step: i * 100 + 10, phase: 0, result: 4, judgePhase: 0, part: 1 }],
        models: [],
      }));
      const { instances, consumption } = effectSweep({ score, runs, events: [], steps: 2500 });
      const global = Array.from(instances.resource.keys()).filter(
        (i) => instances.group[i] === EFFECT_GROUP.charaGlobal,
      );
      expect(global.map((i) => instances.resource[i])).toEqual(
        resources.flatMap((id) => [id, id, id]),
      );
      for (const i of global) {
        expect(instances.end[i] - instances.created[i]).toBe(61);
        expect(instances.displayState[i]).toBe(0);
        expect(instances.animation[i]).toBe(100);
        expect(Array.from(consumption.instance).filter((owner) => owner === i)).toHaveLength(
          instances.resource[i] === 16 ? 1 : [17, 18].includes(instances.resource[i]) ? 3 : 6,
        );
      }
      const local = Array.from(instances.resource.keys()).filter(
        (i) => instances.group[i] === EFFECT_GROUP.charaLocal,
      );
      expect(local).toHaveLength(24);
      expect(
        local.every((i) => instances.resource[i] === 22 && instances.displayState[i] === 1),
      ).toBe(true);
      expect(score.records[0].getInt32(0x28, true)).toBe(mirror ? 10 : 2);
    },
  );
});
