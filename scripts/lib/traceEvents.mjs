import { createReadStream } from "node:fs";

/**
 * 逐个产出 Chrome JSON trace（`{"traceEvents":[...]}`）里的事件对象，不把整个文件读成一个字符串。
 * 一次 20s 播放 trace 就能超过 V8 单个字符串 512MB 的上限，JSON.parse 整文件会直接抛
 * ERR_STRING_TOO_LONG。这里按字符扫描顶层对象边界（正确处理字符串内的括号与转义），
 * 每凑齐一个对象就 JSON.parse 交给调用方，峰值内存只有一个 chunk 加一个事件。
 * 文件不是 JSON 或读取失败时把错误原样抛出。
 */
export async function* readTraceEvents(path) {
  const stream = createReadStream(path, { encoding: "utf8", highWaterMark: 1 << 22 });
  let depth = 0;
  let inString = false;
  let escaped = false;
  let pending = "";
  let objectStart = -1;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
        if (depth === 2) objectStart = i;
      } else if (ch === "}") {
        depth--;
        if (depth === 1 && objectStart !== -1) {
          yield JSON.parse(pending + chunk.slice(objectStart, i + 1));
          pending = "";
          objectStart = -1;
        } else if (depth === 1) {
          yield JSON.parse(pending + chunk.slice(0, i + 1));
          pending = "";
        }
      }
    }
    if (depth >= 2) {
      pending += objectStart !== -1 ? chunk.slice(objectStart) : chunk;
      objectStart = -1;
    }
  }
}
