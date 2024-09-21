import { create } from 'zustand'
import { MaimaiSongList } from "../utils/api/song/maimai.ts";
import { ChunithmSongList } from "../utils/api/song/chunithm.ts";

type SongListState = {
  maimai: MaimaiSongList,
  chunithm: ChunithmSongList,
  getSongList: (game: 'maimai' | 'chunithm') => MaimaiSongList | ChunithmSongList,
  fetchSongList: () => Promise<void>,
}

const useSongListStore = create<SongListState>((set, get) => ({
  maimai: new MaimaiSongList(),
  chunithm: new ChunithmSongList(),
  getSongList: (game) => get()[game],
  fetchSongList: async () => {
    await Promise.all([get().maimai.fetch(), get().chunithm.fetch()]);

    set((state) => ({
      getSongList: (game: 'maimai' | 'chunithm') => state[game],
    }));
  },
}));

export default useSongListStore;