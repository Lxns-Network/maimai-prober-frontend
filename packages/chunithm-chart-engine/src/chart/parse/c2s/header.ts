import table from "./tables/header.json";
import { commandCategory, readFloatBits, readInteger, type CommandRecord } from "./commands";

export type HeaderStrings = Map<number, Uint8Array>;

export interface HeaderWrite {
  kind: string;
  column: number;
  offset: number;
}

interface HeaderCommand {
  writes: HeaderWrite[];
  returnsTrue: boolean;
}

const V = table.version;
const commands = new Map<number, HeaderCommand>(
  Object.entries(table.commands).map(([id, command]) => [Number(id), command]),
);

export const HEADER_VERSION_OFFSETS: readonly number[] = Array.from(
  { length: V.count },
  (_, i) => V.offset + i * V.stride,
);

export const HEADER_PATH_OFFSET: number = table.pathStringOffset;

export const HEADER_STRING_OFFSETS: readonly number[] = [
  ...HEADER_VERSION_OFFSETS,
  ...Object.values(table.commands).flatMap((c) =>
    c.writes.filter((w) => w.kind === "string").map((w) => w.offset),
  ),
];

const numericOffsets = V.numericDeltas.map((x) => V.capacityDelta + x);

export function headerField(id: number, column: number): HeaderWrite | undefined {
  return commands.get(id)?.writes.find((w) => w.column === column);
}

export function headerVersionNumbers(view: DataView, index: number): number[] {
  return numericOffsets.map((delta) => view.getUint32(HEADER_VERSION_OFFSETS[index] + delta, true));
}

function readString(record: CommandRecord, column: number): Uint8Array {
  return record.tokens[column]?.slice() ?? new Uint8Array();
}

function versionNumbers(raw: Uint8Array): number[] {
  const nul = raw.indexOf(0);
  const bytes = nul < 0 ? raw : raw.subarray(0, nul);
  const text = Array.from(bytes, (x) => String.fromCharCode(x)).join("");
  let at = 0;
  const values: number[] = [];
  for (let i = 0; i < V.requiredAssignments; i++) {
    const match = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/.exec(text.slice(at));
    if (!match) return numericOffsets.map(() => V.failureZero);
    const number = BigInt(match[1]);
    if (number < -2147483648n || number > 2147483647n)
      throw new RangeError("版本号数值超出 32 位范围");
    values.push(Number(number) >>> 0);
    at += match[0].length;
    if (i + 1 < V.requiredAssignments) {
      if (text[at] !== ".") return numericOffsets.map(() => V.failureZero);
      at++;
    }
  }
  return values;
}

export function initializeHeader(view: DataView, strings: HeaderStrings): void {
  for (const s of table.scalarStores) {
    if (s.size === 1) view.setUint8(s.offset, s.bits);
    else view.setUint32(s.offset, s.bits, true);
  }
  for (const offset of HEADER_STRING_OFFSETS) strings.set(offset, new Uint8Array());
  strings.set(table.pathStringOffset, new Uint8Array());
  for (const offset of HEADER_VERSION_OFFSETS)
    for (const delta of numericOffsets) view.setUint32(offset + delta, V.failureZero, true);
}

export function applyHeaderRecord(
  view: DataView,
  strings: HeaderStrings,
  record: CommandRecord,
): boolean {
  if (record.id === 0) {
    for (let i = 0; i < HEADER_VERSION_OFFSETS.length; i++) {
      const raw = readString(record, i + 1);
      const offset = HEADER_VERSION_OFFSETS[i];
      strings.set(offset, raw);
      const values = versionNumbers(raw);
      numericOffsets.forEach((delta, n) => view.setUint32(offset + delta, values[n], true));
    }
    return true;
  }
  const command = commands.get(record.id);
  if (!command) return false;
  for (const write of command.writes) {
    const at = write.offset;
    const column = write.column;
    if (write.kind === "string") strings.set(at, readString(record, column));
    else if (write.kind === "float") view.setUint32(at, readFloatBits(record, column), true);
    else if (write.kind === "integer") view.setUint32(at, readInteger(record, column) >>> 0, true);
    else if (write.kind === "positive") view.setUint8(at, Number(readInteger(record, column) > 0));
    else throw new Error(`不支持的头部字段类型 ${write.kind}`);
  }
  return command.returnsTrue;
}

export function readHeaderPass(
  view: DataView,
  strings: HeaderStrings,
  records: readonly CommandRecord[],
): number {
  let next = table.sequenceInitial;
  for (const record of records)
    if (commandCategory(record.id) === 0 && applyHeaderRecord(view, strings, record))
      next = (next + 1) >>> 0;
  return next;
}
