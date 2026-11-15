import table from "./tables/commands.json";
import { decimalFloat32Bits, decimalInt32 } from "./decimal";

export interface CommandRecord {
  readonly id: number;
  readonly tokens: readonly Uint8Array[];
}

export interface TokenizedLine extends CommandRecord {
  readonly valid: boolean;
}

type ValueKind = "integer" | "float";

const rows = table.rows;
const columnDelimiter = Uint8Array.from(table.columnDelimiter);
const tailDelimiter = Uint8Array.from(table.tailDelimiter);
const names = new Map(rows.map((row, index) => [row.name, index]));

function byteKey(bytes: Uint8Array): string {
  let key = "";
  for (const byte of bytes) key += String.fromCharCode(byte);
  return key;
}

export function findBytes(bytes: Uint8Array, needle: Uint8Array, start: number): number {
  outer: for (let i = start; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function untilNul(bytes: Uint8Array): Uint8Array {
  const nul = bytes.indexOf(0);
  return nul < 0 ? bytes : bytes.subarray(0, nul);
}

export function commandId(name: Uint8Array): number {
  return names.get(byteKey(name)) ?? -1;
}

export function commandCategory(id: number): number {
  return id >= 0 && id < rows.length ? rows[id].category : -1;
}

export function commandColumnType(id: number, index: number): number {
  if (
    id < 0 ||
    id >= rows.length ||
    index < 0 ||
    index >= rows[id].columnCount ||
    index > table.fieldSelectorMaxIndex
  )
    return -1;
  return rows[id].columnTypes[index] | 0;
}

export function tokenizeLine(bytes: Uint8Array): TokenizedLine {
  const tokens: Uint8Array[] = [];
  if (!bytes.length) return { id: -1, valid: false, tokens };
  let pos = 0;
  let next: number;
  while ((next = findBytes(bytes, columnDelimiter, pos)) !== -1) {
    tokens.push(bytes.slice(pos, next));
    pos = next + columnDelimiter.length;
  }
  next = findBytes(bytes, tailDelimiter, pos);
  tokens.push(bytes.slice(pos, next === -1 ? bytes.length : next));
  const id = commandId(untilNul(tokens[0]));
  return { id, valid: id >= 0 && id < rows.length, tokens };
}

function readValue(record: CommandRecord, index: number, kind: ValueKind): number {
  if (index >>> 0 >= record.tokens.length) return 0;
  const type = commandColumnType(record.id, index);
  if (type < 0 || type >= table.typeGates.length || table.typeGates[type][kind] !== 1) return 0;
  const token = record.tokens[index];
  if (!token.length) return 0;
  const bytes = untilNul(token);
  return kind === "integer" ? decimalInt32(bytes) : decimalFloat32Bits(bytes);
}

export function readInteger(record: CommandRecord, index: number): number {
  return readValue(record, index, "integer");
}

export function readFloatBits(record: CommandRecord, index: number): number {
  return readValue(record, index, "float");
}
