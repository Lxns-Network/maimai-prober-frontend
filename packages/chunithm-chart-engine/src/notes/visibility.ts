import type { JudgeVisibility } from "./evaluate";
import { attachedAir } from "./modelFlags";

export interface JudgeVisibilityInput {
  readonly records: readonly DataView[];
  readonly times: Float64Array;
  readonly notes: Uint32Array;
  readonly phases: Uint8Array;
  readonly parts: Uint8Array;
}

/** Independent first-result cutoffs; tick and tail results do not hide the head or plain AIR. */
export function computeJudgeVisibility(input: JudgeVisibilityInput): JudgeVisibility {
  const { records, times, notes, phases, parts } = input;
  if (
    notes.length !== times.length ||
    phases.length !== times.length ||
    parts.length !== times.length
  )
    throw new RangeError("Judge visibility columns must be parallel");
  const head = new Float64Array(records.length).fill(Infinity);
  const air = new Float64Array(records.length).fill(Infinity);
  for (let i = 0; i < times.length; i++) {
    const note = notes[i];
    if (note >= records.length) throw new RangeError(`Judge event ${i} names record ${note}`);
    if (!Number.isFinite(times[i])) throw new RangeError(`Judge event ${i} has a non-finite time`);
    if (phases[i] > 2) throw new RangeError(`Judge event ${i} has invalid phase ${phases[i]}`);
    if (parts[i] > 2) throw new RangeError(`Judge event ${i} has invalid part ${parts[i]}`);
    if (parts[i] === 0 && attachedAir(records[note]))
      throw new RangeError(`Judge attribution missing for record ${note}; rebake the event list`);
    if (phases[i] !== 0) continue;
    const column = parts[i] === 2 ? air : head;
    column[note] = Math.min(column[note], times[i]);
  }
  return { head, air };
}
