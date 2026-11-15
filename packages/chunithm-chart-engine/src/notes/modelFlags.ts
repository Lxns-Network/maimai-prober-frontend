/**
 * The two flags that pick a tap's mesh set.
 *
 * They are not record fields. The reference computes them when it constructs a note: the variant flag
 * is set for a character tap and for a hold or slide head that carries the record's marker byte, and
 * the alternate flag for the second and later of those notes that sit at one beat, lane and width.
 * Which tap family a record draws with follows from them, so they are derived here from the records in
 * chart order.
 */

const f32 = Math.fround;

const RECORD_PRIMARY_TYPE = 16;
const RECORD_MARKER = 0x8c;
const RECORD_LANE = 40;
const RECORD_WIDTH_INDEX = 44;
const CHARACTER_TAP = 4;
const RECORD_SECONDARY_TYPE = 20;
/** Secondary types that attach an AIR note to the record. */
const ATTACHED_AIR_TYPES: readonly number[] = [3, 5, 8];
const MAX_MARKED_TYPE = 2;
const WIDTH_COUNT = 16;
const BEAT_TICKS = 96;
const GROUP_TICKS = 384;
const ROUNDING_BIAS = 8388608;
const SIGN = 0x80000000;

const scratch = new DataView(new ArrayBuffer(4));
const bitsOf = (value: number): number => {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
};
const fromBits = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};

/** The reference's key for a record's beat, lane and width, with its float32 rounding and int32 wrap. */
function positionKey(record: DataView): number {
  const index = record.getInt32(RECORD_WIDTH_INDEX, true);
  const width = index >= 0 && index < WIDTH_COUNT ? index + 1 : 0;
  const x = f32(
    f32(record.getFloat32(4, true) * BEAT_TICKS) + f32(record.getFloat32(0, true) * GROUP_TICKS),
  );
  const sign = bitsOf(x) & SIGN;
  const bias = fromBits((Math.abs(x) < ROUNDING_BIAS ? bitsOf(ROUNDING_BIAS) : 0) | sign);
  let rounded = f32(f32(x + bias) - bias);
  if (!(f32(rounded - x) <= fromBits(sign))) rounded = f32(rounded - 1);
  const shifted = f32(rounded + 0.5);
  const truncated =
    Number.isFinite(shifted) && Math.abs(shifted) < 2147483648
      ? Math.trunc(shifted) | 0
      : -2147483648;
  return (((((truncated << 4) + record.getInt32(RECORD_LANE, true)) | 0) << 4) + width) | 0;
}

/** Whether the record carries an attached AIR note, which selects the AIR variant of a hold's tail. */
export function attachedAir(record: DataView): boolean {
  return ATTACHED_AIR_TYPES.includes(record.getInt32(RECORD_SECONDARY_TYPE, true));
}

export interface ModelFlags {
  /** 1 for a record whose model set is the variant one. */
  variant: Uint8Array;
  /** 1 for a variant record that is not the first at its position. */
  alternate: Uint8Array;
}

/** The flags of every record, in record order; positions seen earlier decide the later alternates. */
export function modelFlagsOf(records: readonly DataView[]): ModelFlags {
  const variant = new Uint8Array(records.length);
  const alternate = new Uint8Array(records.length);
  const seen = new Set<number>();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const type = record.getInt32(RECORD_PRIMARY_TYPE, true);
    const marked =
      type > 0 &&
      ((type <= MAX_MARKED_TYPE && record.getUint8(RECORD_MARKER) !== 0) || type === CHARACTER_TAP);
    if (!marked) continue;
    variant[i] = 1;
    const key = positionKey(record);
    alternate[i] = seen.has(key) ? 1 : 0;
    seen.add(key);
  }
  return { variant, alternate };
}
