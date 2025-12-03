import { fetchAPI } from "@/utils/api/api.ts";
import { Game } from "@/types/game";
import { CollectionProps } from "@/types/player";

export async function getSong(game: Game, id: number, version: number) {
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
