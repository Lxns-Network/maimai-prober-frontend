import { fetchAPI } from "./api.ts";

export async function getCommentList(game: string, params: URLSearchParams) {
  return fetchAPI(`user/${game}/comment/list?${params.toString()}`, { method: "GET" });
}

export async function createComment(game: string, data: any) {
  return fetchAPI(`user/${game}/comment`, { method: "POST", body: data });
}

export async function deleteComment(game: string, commentId: number) {
  return fetchAPI(`user/${game}/comment/${commentId}`, { method: "DELETE" });
}

export async function likeComment(game: string, commentId: number) {
  return fetchAPI(`user/${game}/comment/${commentId}/like`, { method: "POST" });
}

export async function unlikeComment(game: string, commentId: number) {
  return fetchAPI(`user/${game}/comment/${commentId}/like`, { method: "DELETE" });
}