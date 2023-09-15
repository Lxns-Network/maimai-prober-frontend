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