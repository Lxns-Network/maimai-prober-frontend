import { fetchAPI } from "../api.ts";

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

interface MaimaiVersionProps {
  id: number;
  title: string;
  version: number;
}

export class MaimaiSongList {
  songs: MaimaiSongProps[] = [];
  genres: MaimaiGenreProps[] = [];
  versions: MaimaiVersionProps[] = [];

  async fetch() {
    if (this.songs.length === 0) {
      const res = await fetchAPI('maimai/song/list', { method: "GET" });
      const data = await res?.json();
      this.songs = data.songs;
      this.genres = data.genres;
      this.versions = data.versions;
    }

    return this.songs;
  }

  find(id: number) {
    return this.songs.find((song: MaimaiSongProps) => song.id === id);
  }

  push(...songs: MaimaiSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
    if (type === "utage") {
      return song.difficulties.utage[level_index]
    } else if (type === "standard") {
      return song.difficulties.standard[level_index]
    } else {
      return song.difficulties.dx[level_index]
    }
  }

  getSongResourceId(id: number) {
    const song = this.find(id);
    if (!song) return 0;
    return song.id % 10000;
  }
}

export function getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
  if (type === "utage" && "utage" in song.difficulties) {
      return song.difficulties.utage[level_index]
  } else if (type === "standard") {
    return song.difficulties.standard[level_index]
  } else if (type === "dx") {
    return song.difficulties.dx[level_index]
  }
  return null;
}