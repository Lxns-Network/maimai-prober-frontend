import { fetchAPI } from "../api.ts";

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

interface ChunithmVersionProps {
  id: number;
  title: string;
  version: number;
}

export class ChunithmSongList {
  songs: ChunithmSongProps[] = [];
  genres: ChunithmGenreProps[] = [];
  versions: ChunithmVersionProps[] = [];

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

  find(id: number) {
    return this.songs.find((song: any) => song.id === id);
  }

  push(...songs: ChunithmSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: ChunithmSongProps, level_index: number) {
    return song.difficulties.find((d) => d.difficulty === level_index);
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