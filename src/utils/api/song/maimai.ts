import { fetchAPI } from "../api.ts";
import { notifications } from "@mantine/notifications";

export interface MaimaiDifficultyProps {
  type: string;
  difficulty: number;
  level: string;
  level_value: number;
  note_designer: string;
  version: number;
  kanji: string;
  description: string;
  is_buddy: boolean;
  notes: MaimaiNotesProps;
}

export interface MaimaiNotesProps {
  total: number;
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;

  left?: MaimaiNotesProps;
  right?: MaimaiNotesProps;
}

export interface MaimaiDifficultiesProps {
  dx: MaimaiDifficultyProps[];
  standard: MaimaiDifficultyProps[];
  utage: MaimaiDifficultyProps[];
}

export interface MaimaiSongProps {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  map?: string;
  version: number;
  disabled?: boolean;
  difficulties: MaimaiDifficultiesProps;
}

export interface MaimaiGenreProps {
  id: number;
  title: string;
  genre: string;
}

export interface MaimaiVersionProps {
  id: number;
  title: string;
  version: number;
}

export class MaimaiSongList {
  songs: MaimaiSongProps[] = [];
  genres: MaimaiGenreProps[] = [];
  versions: MaimaiVersionProps[] = [];

  async fetch(hash?: string): Promise<MaimaiSongList["songs"]> {
    const cachedHash = localStorage.getItem("maimai_songs_hash");
    const cachedData = localStorage.getItem("maimai_songs");

    if (hash && cachedHash === hash && cachedData) {
      const parsedData = JSON.parse(cachedData) as MaimaiSongList;
      if (parsedData.songs?.length) {
        this.updateData(parsedData);
        return this.songs;
      }
    }

    const res = await fetchAPI("maimai/song/list", { method: "GET" });
    const data = (await res.json()) as MaimaiSongList;

    if (data?.songs?.length) {
      localStorage.setItem("maimai_songs", JSON.stringify(data));
      localStorage.setItem("maimai_songs_hash", hash || "");
      this.updateData(data);
      notifications.show({
        title: "已更新曲目列表",
        message: "检测到「舞萌 DX」曲目列表更新，已更新本地缓存。",
      });
    }

    return this.songs;
  }

  private updateData(data: MaimaiSongList): void {
    this.songs = data.songs;
    this.genres = data.genres;
    this.versions = data.versions;
  }

  find(id: number) {
    return this.songs.find((song: MaimaiSongProps) => song.id === id);
  }

  push(...songs: MaimaiSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
    try {
      if (type === "utage") {
        return song.difficulties.utage[level_index]
      } else if (type === "standard") {
        return song.difficulties.standard[level_index]
      } else {
        return song.difficulties.dx[level_index]
      }
    } catch {
      return null;
    }
  }

  getSongResourceId(id: number) {
    return id % 10000;
  }
}

export function getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
  try {
    if (type === "utage" && song.difficulties.utage) {
      return song.difficulties.utage[level_index] ?? null;
    } else if (type === "standard" && song.difficulties.standard) {
      return song.difficulties.standard[level_index] ?? null;
    } else if (type === "dx" && song.difficulties.dx) {
      return song.difficulties.dx[level_index] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}