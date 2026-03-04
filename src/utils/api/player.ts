import { fetchAPI } from "./api.ts";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { Game } from "@/types/game";

export async function getPlayerHeatmap(game: Game): Promise<Response> {
  return fetchAPI(`user/${game}/player/heatmap`, { method: "GET" });
}

export async function getPlayerRatingTrend(game: Game, version: number): Promise<Response> {
  return fetchAPI(`user/${game}/player/trend?version=${version}`, { method: "GET" });
}

export async function updatePlayerData(game: Game, player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps>): Promise<Response> {
  return fetchAPI(`user/${game}/player`, {
    method: "PUT",
    body: player,
  });
}

export async function unbindPlayer(game: Game): Promise<Response> {
  return fetchAPI(`user/${game}/player`, { method: "DELETE" });
}

export async function deletePlayerScores(game: Game): Promise<Response> {
  return fetchAPI(`user/${game}/player/scores`, { method: "DELETE" });
}

export async function createPlayerScores(game: Game, scores: object[]): Promise<Response> {
  return fetchAPI(`user/${game}/player/scores`, { method: "POST", body: { scores } });
}

export async function deletePlayerScore(game: Game, params: URLSearchParams): Promise<Response> {
  return fetchAPI(`user/${game}/player/score?${params.toString()}`, { method: "DELETE" });
}

export async function deletePlayerScoreHistory(game: Game, params: URLSearchParams): Promise<Response> {
  return fetchAPI(`user/${game}/player/scores?${params.toString()}`, { method: "DELETE" });
}

export async function getPlayerCollectionById(game: Game, collectionType: string, id: number): Promise<Response> {
  return fetchAPI(`user/${game}/player/${collectionType}/${id}`, { method: "GET" });
}

export async function getCollectionById(game: Game, collectionType: string, id: number): Promise<Response> {
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
