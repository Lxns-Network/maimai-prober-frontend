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

  async fetch(hash?: string): Promise<ChunithmSongList["songs"]> {
    const cachedHash = localStorage.getItem("chunithm_songs_hash");
    const cachedData = localStorage.getItem("chunithm_songs");

    if (hash && cachedHash === hash && cachedData) {
      const parsedData = JSON.parse(cachedData) as ChunithmSongList;
      if (parsedData.songs?.length) {
        this.updateData(parsedData);
        return this.songs;
      }
    }

    const res = await fetchAPI("chunithm/song/list", { method: "GET" });
    const data = (await res.json()) as ChunithmSongList;

    if (data?.songs?.length) {
      localStorage.setItem("chunithm_songs", JSON.stringify(data));
      localStorage.setItem("chunithm_songs_hash", hash || "");
      this.updateData(data);
    }

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