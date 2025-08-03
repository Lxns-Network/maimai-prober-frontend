import { fetchAPI } from "./api.ts";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { Game } from "@/types/game";

export async function getPlayerHeatmap(game: Game) {
  return fetchAPI(`user/${game}/player/heatmap`, { method: "GET" });
}

export async function getPlayerRatingTrend(game: Game, version: number) {
  return fetchAPI(`user/${game}/player/trend?version=${version}`, { method: "GET" });
}

export async function updatePlayerData(game: Game, player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps>) {
  return fetchAPI(`user/${game}/player`, {
    method: "PUT",
    body: player,
  });
}

export async function unbindPlayer(game: Game) {
  return fetchAPI(`user/${game}/player`, { method: "DELETE" });
}

export async function deletePlayerScores(game: Game) {
  return fetchAPI(`user/${game}/player/scores`, { method: "DELETE" });
}

export async function createPlayerScores(game: Game, scores: any) {
  return fetchAPI(`user/${game}/player/scores`, { method: "POST", body: { scores } });
}

export async function getPlayerCollectionById(game: Game, collectionType: string, id: number) {
  return fetchAPI(`user/${game}/player/${collectionType}/${id}`, { method: "GET" });
}

export async function getCollectionById(game: Game, collectionType: string, id: number) {
  return fetchAPI(`${game}/${collectionType}/${id}`, { method: "GET" });
}

export function isMaimaiPlayerProps(obj: unknown): obj is MaimaiPlayerProps {
  if (!obj) return false;
  return typeof obj === 'object' && 'course_rank' in obj;
}

export function isChunithmPlayerProps(obj: unknown): obj is ChunithmPlayerProps {
  if (!obj) return false;
  return typeof obj === 'object' && 'over_power' in obj;
}