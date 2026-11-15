export type NoteClass =
  | "TapNote"
  | "HoldNote"
  | "SlideNote"
  | "CharaTapNote"
  | "FlickNote"
  | "AirLadderNote"
  | "AirSolidNote"
  | "MineNote"
  | "AirNote"
  | "AirHoldNote"
  | "AirSlideNote";

/** Object class built for a record's primary type. */
const PRIMARY = new Map<number, NoteClass>([
  [0, "TapNote"],
  [1, "HoldNote"],
  [2, "SlideNote"],
  [4, "CharaTapNote"],
  [6, "FlickNote"],
  [9, "AirLadderNote"],
  [10, "AirSolidNote"],
  [11, "MineNote"],
]);

/** Object class built for a record's secondary type, only when its primary type has a route. */
const SECONDARY = new Map<number, NoteClass>([
  [3, "AirNote"],
  [5, "AirHoldNote"],
  [8, "AirSlideNote"],
]);

/** Slot a note object is initialized into: 8 for a primary object, 9 for a secondary one. */
export type ObjectSlot = 8 | 9;

export interface NoteObject {
  record: number;
  className: NoteClass;
  slot: ObjectSlot;
  /** Grid step at whose end the object is built. */
  spawn: number;
  /** Position in the live object list; objects tick in this order at every step. */
  order: number;
}

/**
 * The note objects a run builds, in live-list order. Records spawn in record order within a step;
 * each builds its secondary object, then its primary one. Records with a negative spawn step never
 * spawn.
 */
export function noteObjects(records: readonly DataView[], spawn: Int32Array): NoteObject[] {
  const built: Omit<NoteObject, "order">[] = [];
  records.forEach((record, index) => {
    const step = spawn[index];
    if (step < 0) return;
    const primary = PRIMARY.get(record.getInt32(0x10, true));
    if (!primary) return;
    const secondary = SECONDARY.get(record.getInt32(0x14, true));
    if (secondary) built.push({ record: index, className: secondary, slot: 9, spawn: step });
    built.push({ record: index, className: primary, slot: 8, spawn: step });
  });
  built.sort((a, b) => a.spawn - b.spawn || a.record - b.record || b.slot - a.slot);
  return built.map((object, order) => ({ ...object, order }));
}
