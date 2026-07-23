import { create } from "zustand";
import { MaimaiSongList } from "../utils/api/song/maimai.ts";
import { ChunithmSongList } from "../utils/api/song/chunithm.ts";
import { Game } from "@/types/game";

type SongListState = {
  maimai: MaimaiSongList;
  chunithm: ChunithmSongList;
  getSongList: (game: Game) => MaimaiSongList | ChunithmSongList;
  fetchSongList: (hashes?: {
    [key: string]: {
      [key: string]: string;
    };
  }) => Promise<void>;
};

const useSongListStore = create<SongListState>((set, get) => ({
  maimai: new MaimaiSongList(),
  chunithm: new ChunithmSongList(),
  getSongList: (game) => get()[game],
  fetchSongList: async (hashes) => {
    const nextMaimai = new MaimaiSongList();
    const nextChunithm = new ChunithmSongList();
    const [maimaiResult, chunithmResult] = await Promise.allSettled([
      nextMaimai.fetch(hashes?.maimai?.songs),
      nextChunithm.fetch(hashes?.chunithm?.songs),
    ]);

    set((state) => ({
      maimai: maimaiResult.status === "fulfilled" ? nextMaimai : state.maimai,
      chunithm: chunithmResult.status === "fulfilled" ? nextChunithm : state.chunithm,
      getSongList: (game: Game) => get()[game],
    }));

    const failures = [maimaiResult, chunithmResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      throw new Error(failures.map((result) => String(result.reason)).join("；"));
    }
  },
}));

export default useSongListStore;
