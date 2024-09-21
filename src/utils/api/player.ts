import { fetchAPI } from "./api.ts";

export async function getPlayerRatingTrend(game: string, version: number) {
  return fetchAPI(`user/${game}/player/trend?version=${version}`, { method: "GET" });
}

export async function unbindPlayer(game: string) {
  return fetchAPI(`user/${game}/player`, { method: "DELETE" });
}

export async function deletePlayerScores(game: string) {
  return fetchAPI(`user/${game}/player/scores`, { method: "DELETE" });
}

export async function createPlayerScores(game: string, scores: any) {
  return fetchAPI(`user/${game}/player/scores`, { method: "POST", body: { scores } });
}

export async function getPlayerPlateById(game: string, id: number) {
  return fetchAPI(`user/${game}/player/plate/${id}`, { method: "GET" });
}

export async function getPlateList(game: string, required: boolean) {
  return fetchAPI(`${game}/plate/list?required=${required}`, { method: "GET" });
}

export async function getPlateById(game: string, id: number) {
  return fetchAPI(`${game}/plate/${id}`, { method: "GET" });
}