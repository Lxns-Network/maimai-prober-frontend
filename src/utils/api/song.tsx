import { fetchAPI } from "./api";

export interface DifficultyProps {
  difficulty: string;
  level: string;
  level_value: number;
  note_designer: string;
  version: number;
}

export interface DifficultiesProps {
  dx: DifficultyProps[];
  standard: DifficultyProps[];
}

export interface SongProps {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  version: string;
  difficulties: DifficultiesProps;
}

interface GenreProps {
  id: number;
  title: string;
  genre: string;
}

interface VersionProps {
  id: number;
  title: string;
  version: number;
}

export class SongList {
  songs: SongProps[] = [];
  genres: GenreProps[] = [];
  versions: VersionProps[] = [];

  constructor() {
    this.songs = [];
    this.genres = [];
    this.versions = [];
  }

  async fetch(game: string) {
    if (this.songs.length === 0) {
      const res = await fetchAPI(`${game}/song/list`, { method: "GET" });
      const data = await res?.json();
      this.songs.push(...data.songs);
      this.genres = data.genres;
      this.versions = data.versions;
    }

    return this.songs;
  }

  push(...songs: SongProps[]) {
    this.songs.push(...songs);
  }

  find(id: number) {
    return this.songs.find((song: any) => song.id === id);
  }

  clear() {
    this.songs = [];
  }

  get length() {
    return this.songs.length;
  }
}

export function getDifficulty(song: SongProps, type: string, level_index: number) {
  if (type === "standard") {
    return song.difficulties.standard[level_index]
  } else {
    return song.difficulties.dx[level_index]
  }
}