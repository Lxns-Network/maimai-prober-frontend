import { describe, expect, it, vi } from "vitest";
import { JUDGE_TIMING_BYTES } from "@lxns-network/chunithm-chart-engine/chart/bind/config";
import {
  loadChartInput,
  readChartDifficulties,
  readChartSong,
} from "../src/pages/public/Chart/chunithm/assets/chartInput";

const chart = (...lines: string[]) => new TextEncoder().encode(lines.join("\n") + "\n");

const song = chart(
  "&format=lxchu/1",
  "&id=1086",
  "&title=Title",
  "&artist=Artist",
  "&genre=ORIGINAL",
  "",
  "&lv_3=15+",
  "&base_3=15.7",
  "&des_3=",
  "&chart_3=",
  "bpm 0 150",
  "",
  "&lv_4=15",
  "&base_4=15.4",
  "&chart_4=",
  "bpm 0 150",
);

it("reads the song and the selected difficulty's level from the chart header", () => {
  expect(readChartSong(song, 3)).toEqual({
    title: "Title",
    artist: "Artist",
    difficulty: "MASTER",
    rawLevel: 15,
    levelDecimal: 50,
    exType: 0,
  });
  expect(readChartSong(song, 4)).toMatchObject({
    difficulty: "ULTIMA",
    rawLevel: 15,
    levelDecimal: 0,
  });
});

it("marks WORLD'S END charts, which carry no level", () => {
  const ends = chart(
    "&format=lxchu/1",
    "&id=8000",
    "&title=End",
    "&artist=Artist",
    "&we_kanji=止",
    "&we_star=3",
    "",
    "&des_5=",
    "&chart_5=",
    "bpm 0 150",
  );
  expect(readChartSong(ends, 5)).toEqual({
    title: "End",
    artist: "Artist",
    difficulty: "WORLD'S END",
    rawLevel: 0,
    levelDecimal: 0,
    exType: 2,
    starDifType: 5,
    worldsEndTag: "止",
  });
  const unstarred = chart("&format=lxchu/1", "&title=End", "&artist=A", "&chart_5=");
  expect(readChartSong(unstarred, 5)).not.toHaveProperty("starDifType");
  expect(readChartSong(unstarred, 5)).not.toHaveProperty("worldsEndTag");
});

it("lists the chart's difficulties with their levels", () => {
  expect(readChartDifficulties(song)).toEqual([
    { value: "3", label: "MASTER 15+" },
    { value: "4", label: "ULTIMA 15" },
  ]);
  const ends = chart("&format=lxchu/1", "&title=End", "&artist=A", "&we_kanji=止", "&chart_5=");
  expect(readChartDifficulties(ends)).toEqual([{ value: "5", label: "WORLD'S END 止" }]);
});

it("rejects a chart without the selected difficulty or its level", () => {
  expect(() => readChartSong(song, 2)).toThrow();
  expect(() =>
    readChartSong(chart("&format=lxchu/1", "&title=T", "&artist=A", "&chart_3="), 3),
  ).toThrow();
  expect(() => readChartSong(chart("VERSION\t1.13.00"), 3)).toThrow();
});

describe("loadChartInput", () => {
  const load = async (text: Uint8Array, difficulty?: number, mirror = false) => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("/judge-timing.bin")
        ? new Response(new Uint8Array(JUDGE_TIMING_BYTES))
        : url === "https://assets2.lxns.net/chunithm/chart/8000.txt" ||
            url === "https://assets2.lxns.net/chunithm/chart/1086.txt"
          ? new Response(text.slice())
          : new Response(null, { status: 404 }),
    );
    const musicId = Number(new TextDecoder().decode(text).match(/&id=(\d+)/)![1]);
    return loadChartInput({
      assetBase: "http://assets.test/engine/",
      musicId,
      difficulty,
      mirror,
      signal: new AbortController().signal,
    });
  };

  it("falls back to the chart's highest difficulty", async () => {
    const chart = await load(song, 2);
    expect(chart.difficulty).toBe(4);
    expect(chart.song.difficulty).toBe("ULTIMA");
    expect(chart.difficulties.map((item) => item.value)).toEqual(["3", "4"]);
    expect(chart.jacketUrl).toBe("https://assets2.lxns.net/chunithm/jacket/1086.png");
    expect(chart.musicUrl).toBe("https://assets2.lxns.net/chunithm/music/1086.mp3");
  });

  it("passes the selected mirror mode to the chart worker input", async () => {
    expect((await load(song, 3, true)).mirror).toBe(true);
  });

  it("reads a WORLD'S END chart's stage and its original song's jacket and music", async () => {
    const ends = chart(
      "&format=lxchu/1",
      "&id=8000",
      "&title=End",
      "&artist=Artist",
      "&stage=510",
      "&we_origin=1086",
      "&we_kanji=止",
      "",
      "&chart_5=",
      "bpm 0 150",
    );
    const input = await load(ends);
    expect(input).toMatchObject({ difficulty: 5, stage: 510, mirror: false, musicId: 8000 });
    expect(input.jacketUrl).toBe("https://assets2.lxns.net/chunithm/jacket/1086.png");
    expect(input.musicUrl).toBe("https://assets2.lxns.net/chunithm/music/1086.mp3");
  });
});
