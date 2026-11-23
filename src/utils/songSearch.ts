import { toHiragana, toKatakana } from "wanakana";
import type { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import type { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { normalizeSearchText } from "@/utils/textSearch.ts";

type SongProps = MaimaiSongProps | ChunithmSongProps;

/** 各文本字段均已经 {@link normalizeSearchText} 处理，假名字段在此之后再转为平假名。 */
export interface SongSearchIndex {
  song: SongProps;
  title: string;
  artist: string;
  titleHiragana: string;
  artistHiragana: string;
  aliases: string[];
}

interface SongQuery {
  text: string;
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
      aliasMap.set(alias.song_id, alias.aliases.map(normalizeSearchText));
    }
  }

  return songs.map((song) => {
    const title = normalizeSearchText(song.title);
    const artist = normalizeSearchText(song.artist);
    return {
      song,
      title,
      artist,
      titleHiragana: toHiragana(title),
      artistHiragana: toHiragana(artist),
      aliases: aliasMap.get(song.id) || [],
    };
  });
}

/** 归一化后为空时返回 `null`，由调用方按空白查询处理。 */
function parseQuery(search: string): SongQuery | null {
  const text = normalizeSearchText(search);
  if (!text) return null;
  return {
    text,
    hiragana: toHiragana(text),
    id: !isNaN(Number(text)) ? Number(text) : null,
  };
}

/** 不匹配时返回 `null`；0 为 ID、曲名或别名完全一致，1 为曲名前缀，2 为其余子串匹配。 */
function matchRank(entry: SongSearchIndex, query: SongQuery): number | null {
  const { text, hiragana, id } = query;
  if (id !== null && entry.song.id === id) return 0;
  if (entry.title === text || entry.aliases.includes(text)) return 0;
  if (entry.title.startsWith(text) || entry.titleHiragana.startsWith(hiragana)) return 1;
  if (
    entry.title.includes(text) ||
    entry.titleHiragana.includes(hiragana) ||
    entry.artist.includes(text) ||
    entry.artistHiragana.includes(hiragana) ||
    entry.aliases.some((alias) => alias.includes(text))
  ) {
    return 2;
  }
  return null;
}

/** 按曲目 ID、曲名、艺术家（含罗马音转假名）与别名过滤，保持曲目列表原有顺序；空白查询返回全部曲目。 */
export function searchSongs(index: SongSearchIndex[], search: string): SongProps[] {
  const query = parseQuery(search);
  if (!query) return index.map((entry) => entry.song);
  return index.filter((entry) => matchRank(entry, query) !== null).map((entry) => entry.song);
}

/** 与 {@link searchSongs} 匹配范围相同，但按相关度排序（同档保持原有顺序）并截取前 `limit` 首；空白查询返回空数组。 */
export function searchSongsByRelevance(
  index: SongSearchIndex[],
  search: string,
  limit: number,
): SongProps[] {
  const query = parseQuery(search);
  if (!query) return [];
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
