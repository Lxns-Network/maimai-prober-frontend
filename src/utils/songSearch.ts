import { toHiragana, toKatakana } from "wanakana";
import type { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import type { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";

type SongProps = MaimaiSongProps | ChunithmSongProps;

export interface SongSearchIndex {
  song: SongProps;
  titleLower: string;
  artistLower: string;
  titleHiragana: string;
  artistHiragana: string;
  aliasesLower: string[];
}

interface SongQuery {
  lower: string;
  hiragana: string;
  id: number | null;
}

export function buildSongSearchIndex(
  songs: SongProps[],
  aliases?: { song_id: number; aliases: string[] }[],
): SongSearchIndex[] {
  const aliasMap = new Map<number, string[]>();
  if (aliases) {
    for (const alias of aliases) {
      aliasMap.set(
        alias.song_id,
        alias.aliases.map((a) => a.toLowerCase()),
      );
    }
  }

  return songs.map((song) => ({
    song,
    titleLower: song.title.toLowerCase(),
    artistLower: song.artist.toLowerCase(),
    titleHiragana: toHiragana(song.title).toLowerCase(),
    artistHiragana: toHiragana(song.artist).toLowerCase(),
    aliasesLower: aliasMap.get(song.id) || [],
  }));
}

function parseQuery(search: string): SongQuery {
  return {
    lower: search.toLowerCase(),
    hiragana: toHiragana(search).toLowerCase(),
    id: !isNaN(Number(search)) ? Number(search) : null,
  };
}

/** 不匹配时返回 `null`；0 为 ID、曲名或别名完全一致，1 为曲名前缀，2 为其余子串匹配。 */
function matchRank(entry: SongSearchIndex, query: SongQuery): number | null {
  const { lower, hiragana, id } = query;
  if (id !== null && entry.song.id === id) return 0;
  if (entry.titleLower === lower || entry.aliasesLower.includes(lower)) return 0;
  if (entry.titleLower.startsWith(lower) || entry.titleHiragana.startsWith(hiragana)) return 1;
  if (
    entry.titleLower.includes(lower) ||
    entry.titleHiragana.includes(hiragana) ||
    entry.artistLower.includes(lower) ||
    entry.artistHiragana.includes(hiragana) ||
    entry.aliasesLower.some((alias) => alias.includes(lower))
  ) {
    return 2;
  }
  return null;
}

/** 按曲目 ID、曲名、艺术家（含罗马音转假名）与别名过滤，保持曲目列表原有顺序；空查询返回全部曲目。 */
export function searchSongs(index: SongSearchIndex[], search: string): SongProps[] {
  if (!search) return index.map((entry) => entry.song);
  const query = parseQuery(search);
  return index.filter((entry) => matchRank(entry, query) !== null).map((entry) => entry.song);
}

/** 与 {@link searchSongs} 匹配范围相同，但按相关度排序（同档保持原有顺序）并截取前 `limit` 首；空查询返回空数组。 */
export function searchSongsByRelevance(
  index: SongSearchIndex[],
  search: string,
  limit: number,
): SongProps[] {
  if (!search) return [];
  const query = parseQuery(search);
  const matches: { rank: number; song: SongProps }[] = [];
  for (const entry of index) {
    const rank = matchRank(entry, query);
    if (rank !== null) matches.push({ rank, song: entry.song });
  }
  return matches
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((match) => match.song);
}

/**
 * `Highlight` 只能字面匹配，故同时按原文、平假名、片假名高亮，让罗马音匹配到的假名标题也能高亮。
 * 汉字标题与罗马音没有子串对应，无法高亮，属固有限制。
 */
export function getSongHighlightTerms(search: string): string[] {
  return search ? [search, toHiragana(search), toKatakana(search)] : [];
}
