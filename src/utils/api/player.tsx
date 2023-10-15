import { fetchAPI } from "./api";

export async function getPlayerDetail(game: string) {
  return fetchAPI(`user/${game}/player`, { method: "GET" });
}

export async function getPlayerScores(game: string) {
  return fetchAPI(`user/${game}/player/scores`, { method: "GET" });
}

export async function deletePlayerScores(game: string) {
  return fetchAPI(`user/${game}/player/scores`, { method: "DELETE" });
}

export async function getPlayerPlateById(game: string, id: number) {
  return fetchAPI(`user/${game}/player/plate/${id}`, { method: "GET" });
}

export async function getPlateList(game: string, required: boolean) {
  return fetchAPI(`${game}/plate/list?required=${required}`, { method: "GET" });
}