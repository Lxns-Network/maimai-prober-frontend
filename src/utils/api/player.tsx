import { fetchAPI } from "./api";

export async function getPlayerDetail(game: string) {
  return fetchAPI(`user/${game}/player`, { method: "GET" });
}

export async function getPlayerRatingTrend(game: string, version: number) {
  return fetchAPI(`user/${game}/player/trend?version=${version}`, { method: "GET" });
}

export async function unbindPlayer(game: string) {
  return fetchAPI(`user/${game}/player`, { method: "DELETE" });
}

export async function getPlayerScores(game: string) {
  return fetchAPI(`user/${game}/player/scores`, { method: "GET" });
}

export async function getPlayerBests(game: string) {
  return fetchAPI(`user/${game}/player/bests`, { method: "GET" });
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