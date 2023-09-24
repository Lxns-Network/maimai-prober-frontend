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
  bpm: number;
  version: string;
  difficulties: DifficultiesProps;
}

export const songList: SongProps[] = [];

export async function getSongList() {
  return fetchAPI("song/list", { method: "GET" });
}

export function cacheSongList() {
  getSongList()
    .then(res => res?.json())
    .then((data) => {
      songList.push(...data.songs);
      localStorage.setItem("songs", JSON.stringify(data.songs));
    })
}

export function getSongListFromCache() {
  if (songList.length === 0) {
    const songs = localStorage.getItem("songs");
    if (songs) {
      songList.push(...JSON.parse(songs));
    }
  }
}

export function getSong(id: number) {
  const songs = songList || getSongListFromCache();
  return songs.find((song: any) => song.id === id);
}

export function getDifficulty(song: SongProps, type: string, level_index: number) {
  if (type === "standard") {
    return song.difficulties.standard[level_index]
  } else {
    return song.difficulties.dx[level_index]
  }
}