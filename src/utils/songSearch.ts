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

function parseQuery(search: string): SongQuery | null {
  const text = normalizeSearchText(search);
  if (!text) return null;
  return {
    text,
    hiragana: toHiragana(text),
    id: !isNaN(Number(text)) ? Number(text) : null,
  };
}

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

/** 保持曲目列表原有顺序；空白查询返回全部曲目。 */
export function searchSongs(index: SongSearchIndex[], search: string): SongProps[] {
  const query = parseQuery(search);
  if (!query) return index.map((entry) => entry.song);
  return index.filter((entry) => matchRank(entry, query) !== null).map((entry) => entry.song);
}

/** 按相关度稳定排序并截取前 `limit` 首；空白查询返回空数组。 */
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

/** `Highlight` 只做字面匹配，故额外给出平假名与片假名，让罗马音查询也能高亮假名。 */
export function getSongHighlightTerms(search: string): string[] {
  return search ? [search, toHiragana(search), toKatakana(search)] : [];
}
