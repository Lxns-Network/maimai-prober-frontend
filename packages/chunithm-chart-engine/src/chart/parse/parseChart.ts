import { canonicalizeScore, parseChart, type CanonicalScore, type ScoreRun } from "./c2s/index";
import type { ChartNote } from "./c2s/types";

export interface ParseOptions {
  difficulty: number;
  mirror: boolean;
}

export interface ParsedScore {
  run: ScoreRun;
  notes: readonly ChartNote[];
  canonical: CanonicalScore;
  sourceName: string;
}

export class ChartParseError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(message);
    this.name = "ChartParseError";
  }
}

/** Parses c2s bytes into the loaded score; `difficulty` is carried for binding and does not affect parsing. */
export function parseC2s(bytes: Uint8Array, options: ParseOptions, sourceName = ""): ParsedScore {
  let parsed: ReturnType<typeof parseChart>;
  try {
    parsed = parseChart(bytes, { mode: 0, mirror: options.mirror, serialBase: 0 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const line = /line\s+(\d+)/i.exec(message);
    throw new ChartParseError(message, line ? Number(line[1]) : null);
  }
  return {
    run: parsed.score.run,
    notes: parsed.notes,
    canonical: canonicalizeScore(parsed.score.run),
    sourceName,
  };
}
