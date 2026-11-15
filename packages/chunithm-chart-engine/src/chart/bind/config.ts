import type { BindRow } from "./judgeWindows";
import {
  JUDGE_TIMING_DERIVED,
  JUDGE_TIMING_FIXED,
  JUDGE_TIMING_FLOAT_KEYS,
  JUDGE_TIMING_INT_KEYS,
} from "./judgeTimingTables";
import { toFloat32 } from "./x87";

export const JUDGE_TIMING_BYTES = 0xb0c;

const INT_BASE = 1;
const FLOAT_BASE = 63;
const DERIVED_BASE = 352;
const INT_DEFAULT = 9999;
const FLOAT_DEFAULT_BITS = 0x501502f9;

/** The four judge rows used by notes of a chart at `difficulty`. */
export function bindRowsFromConfig(
  config: DataView,
  difficulty: number,
): [BindRow, BindRow, BindRow, BindRow] {
  const hard = difficulty >= 2 ? 1 : 0;
  return [hard, 2 + hard, 4, 6].map((row) => {
    const base = DERIVED_BASE * 4 + 56 * row;
    return {
      enable: config.getInt32(base, true) === 1,
      unify: config.getInt32(base + 4, true) === 1,
      earlyLimit: Math.fround(-config.getFloat32(base + 8, true)),
      earlyFloor: Math.fround(-config.getFloat32(base + 28, true)),
      lateFloor: config.getFloat32(base + 52, true),
      lateLimit: config.getFloat32(base + 32, true),
    };
  }) as [BindRow, BindRow, BindRow, BindRow];
}

/**
 * Compiles a JudgeTiming.ini file (Shift_JIS) into the 0xb0c-byte judge-timing configuration.
 * Keys the file does not set take their built-in fallback.
 *
 * @throws {RangeError} A value that is not a number or does not fit its slot.
 */
export function compileJudgeTimingIni(bytes: Uint8Array): DataView {
  const ini = parseIni(new TextDecoder("shift_jis").decode(bytes));
  const words = new DataView(new ArrayBuffer(JUDGE_TIMING_BYTES));
  for (let i = INT_BASE; i < FLOAT_BASE; i++) words.setInt32(i * 4, INT_DEFAULT, true);
  for (let i = FLOAT_BASE; i < DERIVED_BASE; i++) words.setUint32(i * 4, FLOAT_DEFAULT_BITS, true);
  for (const e of JUDGE_TIMING_INT_KEYS) {
    const text = ini.get(e.section)?.get(e.key.toLowerCase());
    const value = text === undefined ? e.fallback : parseIntStrict(text, e);
    words.setInt32((INT_BASE + e.index) * 4, value, true);
  }
  for (const e of JUDGE_TIMING_FLOAT_KEYS) {
    const text = ini.get(e.section)?.get(e.key.toLowerCase());
    if (text === undefined) words.setUint32((FLOAT_BASE + e.index) * 4, e.fallbackBits, true);
    else words.setFloat32((FLOAT_BASE + e.index) * 4, parseFloatStrict(text, e), true);
  }
  for (const [dword, bits] of JUDGE_TIMING_FIXED) words.setUint32(dword * 4, bits, true);
  for (const [destination, source] of JUDGE_TIMING_DERIVED)
    words.setUint32(destination * 4, words.getUint32(source * 4, true), true);
  return words;
}

/** Section names match exactly, keys case-insensitively; a later duplicate key wins; `;` starts a comment. */
function parseIni(text: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let section: Map<string, string> | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      const name = head[1];
      section = out.get(name) ?? new Map();
      out.set(name, section);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0 || !section) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    section.set(
      key,
      line
        .slice(eq + 1)
        .split(";")[0]
        .trim(),
    );
  }
  return out;
}

interface KeyName {
  section: string;
  key: string;
}

function parseIntStrict(text: string, e: KeyName): number {
  const m = /^[+-]?\d+/.exec(text);
  if (!m) throw new RangeError(`JudgeTiming ${e.section}.${e.key}: invalid integer "${text}"`);
  const value = Number(m[0]);
  if (value < -0x80000000 || value > 0x7fffffff)
    throw new RangeError(`JudgeTiming ${e.section}.${e.key}: integer out of range "${text}"`);
  return value;
}

/** Decimal prefix of `text`, rounded once to single precision. */
function parseFloatStrict(text: string, e: KeyName): number {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?/.exec(text);
  const whole = m?.[2] ?? "";
  const fraction = m?.[3] ?? "";
  if (!m || whole.length + fraction.length === 0)
    throw new RangeError(`JudgeTiming ${e.section}.${e.key}: invalid number "${text}"`);
  const digits = BigInt(whole + fraction);
  const sign = m[1] === "-" ? 1 : 0;
  if (digits === 0n) return sign ? -0 : 0;
  const exp10 = Number(m[4] ?? 0) - fraction.length;
  let num = digits;
  let den = 1n;
  if (exp10 >= 0) num *= 10n ** BigInt(exp10);
  else den = 10n ** BigInt(-exp10);
  const shift = 27 + den.toString(2).length - num.toString(2).length;
  const n = shift >= 0 ? num << BigInt(shift) : num;
  const d = shift >= 0 ? den : den << BigInt(-shift);
  const q = n / d;
  const sticky = n % d === 0n ? 0n : 1n;
  const value = toFloat32({ k: "fin", s: sign, m: (q << 1n) | sticky, e: -shift - 1 });
  if (value === 0 || !Number.isFinite(value))
    throw new RangeError(`JudgeTiming ${e.section}.${e.key}: number out of range "${text}"`);
  return value;
}
