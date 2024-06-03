import { fetchAPI } from "../api.tsx";
import { SongList } from "./song.tsx";

export interface DifficultyProps {
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
  version: number;
  difficulties: DifficultyProps[];
}

interface ChunithmGenreProps {
  id: number;
  genre: string;
}

interface ChunithmVersionProps {
  id: number;
  title: string;
  version: number;
}

export class ChunithmSongList extends SongList {
  songs: ChunithmSongProps[] = [];
  genres: ChunithmGenreProps[] = [];
  versions: ChunithmVersionProps[] = [];

  constructor() {
    super();
  }

  async fetch() {
    if (this.songs.length === 0) {
      const res = await fetchAPI('chunithm/song/list', { method: "GET" });
      const data = await res?.json();
      this.songs = data.songs;
      this.genres = data.genres;
      this.versions = data.versions;
    }

    return this.songs;
  }

  push(...songs: ChunithmSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: ChunithmSongProps, level_index: number) {
    return song.difficulties.find((d) => d.difficulty === level_index);
  }

  getSongResourceId(song: ChunithmSongProps) {
    if (!song) return 0;
    return song.id < 8000 ? song.id : (song.difficulties[0] || {}).origin_id;
  }
}

export function getDifficulty(song: ChunithmSongProps, level_index: number) {
  return song.difficulties.find((d) => d.difficulty === level_index);
}