import { fetchAPI } from "../api.ts";
import { notifications } from "@mantine/notifications";

function clearCachedSongs(dataKey: string, hashKey: string) {
  try {
    localStorage.removeItem(dataKey);
    localStorage.removeItem(hashKey);
  } catch {
    return;
  }
}

export interface ChunithmDifficultyProps {
  difficulty: number;
  level: string;
  level_value: number;
  note_designer: string;
  origin_id: number;
  kanji: string;
  star: number;
  version: number;
  notes: ChunithmNotesProps;
}

export interface ChunithmNotesProps {
  total: number;
  tap: number;
  hold: number;
  slide: number;
  air: number;
  flick: number;
}

export interface ChunithmSongProps {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  map?: string;
  version: number;
  disabled?: boolean;
  difficulties: ChunithmDifficultyProps[];
}

export interface ChunithmGenreProps {
  id: number;
  genre: string;
}

export interface ChunithmVersionProps {
  id: number;
  title: string;
  version: number;
}

export class ChunithmSongList {
  songs: ChunithmSongProps[] = [];
  genres: ChunithmGenreProps[] = [];
  versions: ChunithmVersionProps[] = [];

  async fetch(hash?: string): Promise<ChunithmSongList["songs"]> {
    let cachedHash: string | null = null;
    let cachedData: string | null = null;
    try {
      cachedHash = localStorage.getItem("chunithm_songs_hash");
      cachedData = localStorage.getItem("chunithm_songs");
    } catch {
      cachedHash = null;
      cachedData = null;
    }

    if (hash && cachedHash === hash && cachedData) {
      try {
        const parsedData = JSON.parse(cachedData) as ChunithmSongList;
        if (parsedData.songs?.length) {
          this.updateData(parsedData);
          return this.songs;
        }
      } catch {
        clearCachedSongs("chunithm_songs", "chunithm_songs_hash");
      }
    }

    const res = await fetchAPI("chunithm/song/list", { method: "GET" });
    if (!res.ok) throw new Error(`中二节奏曲目列表请求失败：${res.status}`);

    const data = (await res.json()) as ChunithmSongList;
    if (!Array.isArray(data?.songs) || data.songs.length === 0) {
      throw new Error("中二节奏曲目列表响应格式无效");
    }

    this.updateData(data);
    let cacheUpdated = true;
    try {
      localStorage.setItem("chunithm_songs", JSON.stringify(data));
      localStorage.setItem("chunithm_songs_hash", hash || "");
    } catch {
      cacheUpdated = false;
    }
    notifications.show({
      title: "已更新曲目列表",
      message: cacheUpdated
        ? "检测到「中二节奏」曲目列表更新，已更新本地缓存。"
        : "曲目列表已载入，但浏览器存储空间不足，刷新后可能需要重新下载。",
      color: cacheUpdated ? undefined : "yellow",
    });

    return this.songs;
  }

  private updateData(data: ChunithmSongList): void {
    this.songs = data.songs;
    this.genres = data.genres;
    this.versions = data.versions;
  }

  find(id: number) {
    return this.songs.find((song: ChunithmSongProps) => song.id === id);
  }

  push(...songs: ChunithmSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: ChunithmSongProps, level_index: number) {
    return song.difficulties.find((d) => d.difficulty === level_index) || null;
  }

  getSongResourceId(id: number) {
    const song = this.find(id);
    if (!song) return 0;
    return song.id < 8000 ? song.id : (song.difficulties[0] || {}).origin_id;
  }
}

export function getDifficulty(song: ChunithmSongProps, level_index: number) {
  return song.difficulties.find((d) => d.difficulty === level_index) || null;
}
