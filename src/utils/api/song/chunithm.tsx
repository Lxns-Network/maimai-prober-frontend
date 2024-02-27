import { fetchAPI } from "../api.tsx";
import { SongList } from "./song.tsx";

export interface DifficultyProps {
  difficulty: number;
  level: string;
  level_value: number;
  note_designer: string;
  version: number;
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

interface ChunithmVersionProps {
  id: number;
  title: string;
  version: number;
}

export class ChunithmSongList extends SongList {
  songs: ChunithmSongProps[] = [];
  versions: ChunithmVersionProps[] = [];

  constructor() {
    super();
  }

  async fetch() {
    if (this.songs.length === 0) {
      const res = await fetchAPI('chunithm/song/list', { method: "GET" });
      const data = await res?.json();
      this.songs = data.songs;
      this.versions = data.versions;
    }

    return this.songs;
  }

  push(...songs: ChunithmSongProps[]) {
    this.songs.push(...songs);
  }

  getDifficulty(song: ChunithmSongProps, level_index: number) {
    return song.difficulties[level_index]
  }
}

export function getDifficulty(song: ChunithmSongProps, level_index: number) {
  return song.difficulties[level_index]
}