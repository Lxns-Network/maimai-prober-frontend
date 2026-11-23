import { describe, expect, it } from "vitest";
import type { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import {
  buildSongSearchIndex,
  getSongHighlightTerms,
  searchSongs,
  searchSongsByRelevance,
} from "@/utils/songSearch.ts";

const song = (id: number, title: string, artist: string) =>
  ({ id, title, artist }) as MaimaiSongProps;

const nightOfFire = song(1, "Night of Fire", "Niko");
const fire = song(2, "Fire", "Artist A");
const firestorm = song(3, "Firestorm", "B");
const bokura = song(4, "ぼくらの16bit戦争", "sasakure.UK");
const fireBand = song(5, "Other", "Fire Band");
const wave = song(6, "Wave 7", "C");
const seven = song(7, "Seven", "D");
const songs = [nightOfFire, fire, firestorm, bokura, fireBand, wave, seven];
const index = buildSongSearchIndex(songs, [{ song_id: 3, aliases: ["风暴"] }]);

const ids = (result: { id: number }[]) => result.map((item) => item.id);

describe("searchSongs", () => {
  it("returns every song for an empty query", () => {
    expect(searchSongs(index, "")).toEqual(songs);
  });

  it("keeps list order and matches title or artist case-insensitively", () => {
    expect(ids(searchSongs(index, "FIRE"))).toEqual([1, 2, 3, 5]);
  });

  it("matches romaji against kana titles", () => {
    expect(searchSongs(index, "bokura")).toEqual([bokura]);
  });

  it("matches aliases", () => {
    expect(searchSongs(index, "风")).toEqual([firestorm]);
  });

  it("matches song ids alongside title substrings", () => {
    expect(ids(searchSongs(index, "7"))).toEqual([6, 7]);
  });
});

describe("searchSongsByRelevance", () => {
  it("returns nothing for an empty query", () => {
    expect(searchSongsByRelevance(index, "", 10)).toEqual([]);
  });

  it("ranks exact titles, then title prefixes, then other substrings", () => {
    expect(ids(searchSongsByRelevance(index, "fire", 10))).toEqual([2, 3, 1, 5]);
  });

  it("ranks an exact id or alias first", () => {
    expect(ids(searchSongsByRelevance(index, "7", 10))).toEqual([7, 6]);
    expect(searchSongsByRelevance(index, "风暴", 10)).toEqual([firestorm]);
  });

  it("truncates to the limit after ranking", () => {
    expect(ids(searchSongsByRelevance(index, "fire", 2))).toEqual([2, 3]);
  });
});

describe("getSongHighlightTerms", () => {
  it("adds hiragana and katakana forms of romaji", () => {
    expect(getSongHighlightTerms("bokura")).toEqual(["bokura", "ぼくら", "ボクラ"]);
  });

  it("returns no terms for an empty query", () => {
    expect(getSongHighlightTerms("")).toEqual([]);
  });
});
