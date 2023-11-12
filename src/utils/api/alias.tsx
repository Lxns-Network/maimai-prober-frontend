import { fetchAPI } from "./api.tsx";

export async function getAliasList(game: string, page: number, sort: string = "alias_id", order: string = "desc", songId: number = 0) {
  let url = `user/${game}/alias/list?page=${page}&sort=${sort}+${order}`;
  if (songId !== 0) {
    url += `&song_id=${songId}`;
  }
  return fetchAPI(url, { method: "GET" });
}

export async function getUserVotes(game: string) {
  return fetchAPI(`user/${game}/alias/votes`, { method: "GET" });
}

export async function voteAlias(game: string, aliasId: number, vote: boolean) {
  return fetchAPI(`user/${game}/alias/${aliasId}/vote/${vote ? 'up' : 'down'}`, { method: "POST" });
}

export async function deleteUserAlias(game: string, aliasId: number) {
  return fetchAPI(`user/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function deleteAlias(game: string, aliasId: number) {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function approveAlias(game: string, aliasId: number) {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}/approve`, { method: "POST" });
}