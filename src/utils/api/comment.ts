import { fetchAPI } from "./api.ts";

export async function createComment(game: string, data: object): Promise<Response> {
  return fetchAPI(`user/${game}/comment`, { method: "POST", body: data });
}

export async function deleteComment(game: string, commentId: number): Promise<Response> {
  return fetchAPI(`user/${game}/comment/${commentId}`, { method: "DELETE" });
}

export async function likeComment(game: string, commentId: number): Promise<Response> {
  return fetchAPI(`user/${game}/comment/${commentId}/like`, { method: "POST" });
}

export async function unlikeComment(game: string, commentId: number): Promise<Response> {
  return fetchAPI(`user/${game}/comment/${commentId}/like`, { method: "DELETE" });
}
