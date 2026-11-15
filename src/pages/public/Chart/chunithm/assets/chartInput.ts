import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import { getChunithmChartUrl, getChunithmJacketUrl, getChunithmMusicUrl } from "./urls";
import type { HudSong } from "../rendering/hud";
import type { ChartInput } from "../rendering/notes";

const DIFFICULTIES = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA", "WORLD'S END"];
const WORLDS_END = 5;
const WORLDS_END_EX_TYPE = 2;
const JUDGE_TIMING_FILE = "judge-timing.bin";

async function fetchBytes(url: string, signal: AbortSignal, failure: (status: number) => string) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(failure(response.status));
  return new Uint8Array(await response.arrayBuffer());
}

function readChartKeys(bytes: Uint8Array): Map<string, string> {
  const lines = new TextDecoder().decode(bytes).split("\n");
  if (!/^&format=lxchu\/1(\.\d+)?\r?$/.test(lines[0])) throw new RangeError("Not an lxchu/1 chart");
  const keys = new Map<string, string>();
  for (const line of lines) {
    const equals = line.indexOf("=");
    if (line.startsWith("&") && equals > 0 && !keys.has(line.slice(1, equals)))
      keys.set(line.slice(1, equals), line.slice(equals + 1).replace(/\r$/, ""));
  }
  return keys;
}

const integerKey = (keys: Map<string, string>, key: string) => {
  const value = keys.get(key);
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
};

function difficultiesOf(keys: Map<string, string>): { value: string; label: string }[] {
  return DIFFICULTIES.flatMap((name, difficulty) => {
    if (!keys.has(`chart_${difficulty}`)) return [];
    const level = difficulty === WORLDS_END ? keys.get("we_kanji") : keys.get(`lv_${difficulty}`);
    return [{ value: String(difficulty), label: level ? `${name} ${level}` : name }];
  });
}

function songOf(keys: Map<string, string>, difficulty: number): HudSong {
  if (!keys.has(`chart_${difficulty}`)) throw new RangeError("这首歌没有所选难度的谱面。");
  const title = keys.get("title");
  const artist = keys.get("artist");
  if (!title || artist === undefined) throw new RangeError("The chart names no song");
  const name = DIFFICULTIES[difficulty];
  if (difficulty === WORLDS_END) {
    const stars = integerKey(keys, "we_star");
    const tag = keys.get("we_kanji");
    return {
      title,
      artist,
      difficulty: name,
      rawLevel: 0,
      levelDecimal: 0,
      exType: WORLDS_END_EX_TYPE,
      ...(stars === null || stars < 1 ? {} : { starDifType: stars * 2 - 1 }),
      ...(tag ? { worldsEndTag: tag } : {}),
    };
  }
  const level = /^(\d+)(\+?)$/.exec(keys.get(`lv_${difficulty}`) ?? "");
  if (!name || !level) throw new RangeError(`The chart has no level for difficulty ${difficulty}`);
  return {
    title,
    artist,
    difficulty: name,
    rawLevel: Number(level[1]),
    levelDecimal: level[2] ? 50 : 0,
    exType: 0,
  };
}

/** The difficulties the chart has, labelled with their levels. */
export function readChartDifficulties(bytes: Uint8Array): { value: string; label: string }[] {
  return difficultiesOf(readChartKeys(bytes));
}

/** The song and level the interface shows for one difficulty, from the chart's header keys. */
export function readChartSong(bytes: Uint8Array, difficulty: number): HudSong {
  return songOf(readChartKeys(bytes), difficulty);
}

/**
 * Reads the song's chart from the shared asset host and the judge configuration beside the engine
 * packs, at the requested difficulty, or the chart's highest one when it lacks the request.
 */
export async function loadChartInput(options: {
  assetBase: string;
  musicId: number;
  difficulty?: number;
  mirror: boolean;
  signal: AbortSignal;
}): Promise<
  ChartInput & {
    song: HudSong;
    difficulties: { value: string; label: string }[];
    stage: number | null;
    jacketUrl: string;
    musicUrl: string;
  }
> {
  const { signal, musicId } = options;
  throwIfAborted(signal);
  if (!Number.isSafeInteger(musicId) || musicId < 0)
    throw new RangeError("A known music identity is required for chart loading");
  const [bytes, config] = await Promise.all([
    fetchBytes(getChunithmChartUrl(musicId), signal, (status) => `谱面加载失败（${status}）。`),
    fetchBytes(
      new URL(JUDGE_TIMING_FILE, options.assetBase).href,
      signal,
      (status) => `判定配置加载失败（${status}）。`,
    ),
  ]);
  throwIfAborted(signal);
  const keys = readChartKeys(bytes);
  const difficulties = difficultiesOf(keys);
  if (!difficulties.length) throw new RangeError("这首歌没有谱面。");
  const difficulty = difficulties.some((item) => Number(item.value) === options.difficulty)
    ? options.difficulty!
    : Number(difficulties[difficulties.length - 1].value);
  return {
    bytes,
    config,
    difficulty,
    mirror: options.mirror,
    musicId,
    song: songOf(keys, difficulty),
    difficulties,
    stage: integerKey(keys, "stage"),
    jacketUrl: getChunithmJacketUrl(integerKey(keys, "we_origin") ?? musicId),
    musicUrl: getChunithmMusicUrl(integerKey(keys, "we_origin") ?? musicId),
  };
}
