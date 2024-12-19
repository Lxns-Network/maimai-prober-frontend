import { create } from 'zustand'
import { MaimaiSongList } from "../utils/api/song/maimai.ts";
import { ChunithmSongList } from "../utils/api/song/chunithm.ts";
import { Game } from "@/types/game";

type SongListState = {
  maimai: MaimaiSongList,
  chunithm: ChunithmSongList,
  getSongList: (game: Game) => MaimaiSongList | ChunithmSongList,
  fetchSongList: (hashes?: {
    [key: string]: {
      [key: string]: string;
    }
  }) => Promise<void>,
}

const useSongListStore = create<SongListState>((set, get) => ({
  maimai: new MaimaiSongList(),
  chunithm: new ChunithmSongList(),
  getSongList: (game) => get()[game],
  fetchSongList: async (hashes) => {
    await Promise.all([
      get().maimai.fetch(hashes?.maimai.songs),
      get().chunithm.fetch(hashes?.chunithm.songs),
    ]);

    set((state) => ({
      getSongList: (game: Game) => state[game],
    }));
  },
}));

export default useSongListStore;