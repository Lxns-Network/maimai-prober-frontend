import { fetchAPI } from "@/utils/api/api.ts";
import { Game } from "@/types/game";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { CollectionProps } from "@/types/player";

export async function getSong(game: Game, id: number, version: number): Promise<MaimaiSongProps | ChunithmSongProps | null> {
  const res = await fetchAPI(`${game}/song/${id}?version=${version}`, {
      method: "GET",
  });
  if (res.status === 404) return null;
  return await res.json();
}

export interface SongCollectionItemProps extends CollectionProps {
  type: "trophy" | "plate" | "icon" | "frame" | "character";
}

export async function getSongCollections(game: Game, songId: number): Promise<SongCollectionItemProps[] | null> {
  const res = await fetchAPI(`${game}/song-collections/${songId}`, {
    method: "GET",
  });
  if (res.status === 404) return null;
  return await res.json();
}
