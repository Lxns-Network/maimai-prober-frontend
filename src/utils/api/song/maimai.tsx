import { fetchAPI } from "../api.tsx";
import { SongList } from "./song.tsx";

export interface DifficultyProps {
  difficulty: number;
  level: string;
  level_value: number;
  note_designer: string;
  version: number;
}

export interface MaimaiDifficultiesProps {
  dx: DifficultyProps[];
  standard: DifficultyProps[];
}

export interface MaimaiSongProps {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  version: number;
  difficulties: MaimaiDifficultiesProps;
}

interface MaimaiGenreProps {
  id: number;
  title: string;
  genre: string;
}

interface MaimaiVersionProps {
  id: number;
  title: string;
  version: number;
}

export class MaimaiSongList extends SongList {
  songs: MaimaiSongProps[] = [];
  genres: MaimaiGenreProps[] = [];
  versions: MaimaiVersionProps[] = [];

  constructor() {
    super();
    this.genres = [];
    this.versions = [];
  }

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

  push(...songs: MaimaiSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
    if (type === "standard") {
      return song.difficulties.standard[level_index]
    } else {
      return song.difficulties.dx[level_index]
    }
  }
}

export function getDifficulty(song: MaimaiSongProps, type: string, level_index: number) {
  if (type === "standard") {
    return song.difficulties.standard[level_index]
  } else {
    return song.difficulties.dx[level_index]
  }
}