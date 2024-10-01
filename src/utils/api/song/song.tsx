import { fetchAPI } from "@/utils/api/api.ts";
import { Game } from "@/types/game";

export async function getSong(game: Game, id: number, version: number) {
  const res = await fetchAPI(`${game}/song/${id}?version=${version}`, {
      method: "GET",
  });
  if (res.status === 404) return null;
  return await res.json();
}
