/**
 * Record retention until the step after its last result. Component visibility is independent: a
 * model can hide on the result tick while its record still carries another part or pending removal.
 */

/** Grid steps from a result tick to record removal, applied by the active set. */
export const REMOVAL_STEPS = 1;

/** Grace period past its own end for a record that never receives a judge event, in seconds. */
export const UNJUDGED_GRACE_SECONDS = 0.1;

export interface ComputeEndInput {
  /** Judge event times in seconds, in Timeline order. */
  judgeTimes: Float64Array;
  /** Record index each judge event belongs to, parallel to {@link judgeTimes}. */
  judgeRecords: Uint32Array;
  /** Whether the record is a long note; long notes are held to their tail when unjudged. */
  isLong: (record: number) => boolean;
  /** The record's own end time in seconds, including the end of an AIR long note on it. */
  endSeconds: (record: number) => number;
  /** Number of records the columns must cover. */
  recordCount: number;
}

/**
 * Removal-request time per record, in seconds; the active set retains the request tick.
 *
 * {@link judgeTimes} need not be sorted by record, and a record may appear several times (a long note
 * is judged at head, each tick and tail); the last event in time wins. A record with no judge event
 * falls back to its own end plus {@link UNJUDGED_GRACE_SECONDS}, and is never removed before that.
 */
export function computeEnd(input: ComputeEndInput): Float64Array {
  const { judgeTimes, judgeRecords, recordCount } = input;
  if (judgeTimes.length !== judgeRecords.length)
    throw new RangeError(
      `Judge columns must be parallel: ${judgeTimes.length} times for ${judgeRecords.length} records`,
    );

  const end = new Float64Array(recordCount);
  const judged = new Uint8Array(recordCount);
  for (let i = 0; i < judgeTimes.length; i++) {
    const record = judgeRecords[i];
    if (record >= recordCount)
      throw new RangeError(`Judge event ${i} names record ${record} of ${recordCount}`);
    const time = judgeTimes[i];
    if (!Number.isFinite(time)) throw new RangeError(`Judge event ${i} has a non-finite time`);
    if (!judged[record] || time > end[record]) end[record] = time;
    judged[record] = 1;
  }

  for (let record = 0; record < recordCount; record++)
    if (!judged[record]) end[record] = input.endSeconds(record) + UNJUDGED_GRACE_SECONDS;
  return end;
}
