import { fetchAPI } from "@/utils/api/api.ts";
import { Game } from "@/types/game";

export async function getCrawlStatistic(game: Game): Promise<Response> {
  return fetchAPI(`${game}/crawl/statistic`, { method: "GET" });
}
