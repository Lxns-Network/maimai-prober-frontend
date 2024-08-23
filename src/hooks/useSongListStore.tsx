import { create } from 'zustand'
import { MaimaiSongList } from "../utils/api/song/maimai.tsx";
import { ChunithmSongList } from "../utils/api/song/chunithm.tsx";

interface SongListState {
  maimai: MaimaiSongList,
  chunithm: ChunithmSongList,
  getSongList: (game: 'maimai' | 'chunithm') => MaimaiSongList | ChunithmSongList,
  fetchSongList: () => Promise<void>,
}

const useSongListStore = create<SongListState>((_, get) => ({
  maimai: new MaimaiSongList(),
  chunithm: new ChunithmSongList(),
  getSongList: (game) => get()[game],
  fetchSongList: async () => {
    await get().maimai.fetch();
    await get().chunithm.fetch();
  },
}));

export default useSongListStore;