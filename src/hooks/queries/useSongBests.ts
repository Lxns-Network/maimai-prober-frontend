import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { fetchAPI } from "@/utils/api/api.ts";
import { APIError } from "@/utils/errors.ts";
import { queryKeys } from "./queryKeys.ts";

async function fetchBests(game: Game, songId: number, type?: string) {
  const params = new URLSearchParams({ song_id: songId.toString() });
  if (type) params.append("song_type", type);

  const res = await fetchAPI(`user/${game}/player/bests?${params.toString()}`, { method: "GET" });
  const data = await res.json();
  if (!data.success) {
    if (data.code === 404) return [];
    throw new APIError(data.message, { status: res.status, code: data.code });
  }
  return data.data;
}

function getMaimaiTypes(song: MaimaiSongProps): string[] {
  const types: string[] = [];
  if (song.difficulties.dx.length) types.push("dx");
  if (song.difficulties.standard.length) types.push("standard");
  if (song.difficulties.utage?.length) types.push("utage");
  return types;
}

export const useSongBests = (
  game: Game,
  song: MaimaiSongProps | ChunithmSongProps | null,
) => {
  const isLoggedOut = !localStorage.getItem("token");

  const { data, error, isLoading } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.song.bests(game, song?.id ?? 0),
    queryFn: async () => {
      if (!song) return [];

      if (game === "maimai") {
        const types = getMaimaiTypes(song as MaimaiSongProps);
        const results = await Promise.all(types.map(type => fetchBests(game, song.id, type)));
        return results.flat().filter(Boolean);
      } else {
        return await fetchBests(game, song.id);
      }
    },
    enabled: !!song && !isLoggedOut,
  });

  return {
    scores: data || [],
    isLoading,
    error,
  };
};
