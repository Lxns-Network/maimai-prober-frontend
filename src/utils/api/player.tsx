import { fetchAPI } from "./api";

export async function getPlayerDetail() {
  return fetchAPI("user/player", { method: "GET" });
}

export async function getPlayerScores() {
  return fetchAPI("user/player/scores", { method: "GET" });
}

export async function deletePlayerScores() {
  return fetchAPI("user/player/scores", { method: "DELETE" });
}

export async function getPlayerPlateById(id: number) {
  return fetchAPI(`user/player/plate/${id}`, { method: "GET" });
}

export async function getPlateList(required: boolean) {
  return fetchAPI(`plate/list?required=${required}`, { method: "GET" });
}