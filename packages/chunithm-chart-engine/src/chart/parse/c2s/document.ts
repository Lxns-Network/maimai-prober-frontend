import table from "./tables/document.json";
import { tokenizeLine, type TokenizedLine } from "./commands";

export interface DocumentReadResult {
  success: boolean;
  records: TokenizedLine[];
  linesRead: number;
}

function appendLine(bytes: Uint8Array, records: TokenizedLine[]): void {
  const nul = bytes.indexOf(0);
  const record = tokenizeLine(nul < 0 ? bytes : bytes.subarray(0, nul));
  if (record.valid && record.id >>> 0 <= table.acceptedMaxCommandId) records.push(record);
}

export function readDocumentLines(bytes: Uint8Array, lineLimit = 0): DocumentReadResult {
  if (!Number.isInteger(lineLimit) || lineLimit < 0 || lineLimit > 0xffffffff)
    throw new RangeError("行数上限必须是 uint32 整数");
  const records: TokenizedLine[] = [];
  let pos = 0;
  let linesRead = 0;
  while (pos < bytes.length) {
    const index = bytes.indexOf(table.lineDelimiter, pos);
    const end = index < 0 ? bytes.length : index;
    appendLine(bytes.subarray(pos, end), records);
    linesRead++;
    pos = index < 0 ? end : end + 1;
    if (lineLimit && linesRead >= lineLimit) break;
  }
  return { success: records.length !== 0, records, linesRead };
}
