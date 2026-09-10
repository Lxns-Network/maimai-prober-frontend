import { create } from "zustand";
import { MaimaiSongList } from "../utils/api/song/maimai.ts";
import { ChunithmSongList } from "../utils/api/song/chunithm.ts";

type SongListState = {
  maimai: MaimaiSongList;
  chunithm: ChunithmSongList;
  fetchSongList: (hashes?: {
    [key: string]: {
      [key: string]: string;
    };
  }) => Promise<void>;
};

const useSongListStore = create<SongListState>((set) => ({
  maimai: new MaimaiSongList(),
  chunithm: new ChunithmSongList(),
  fetchSongList: async (hashes) => {
    const maimai = new MaimaiSongList();
    const chunithm = new ChunithmSongList();
    await Promise.all([
      maimai.fetch(hashes?.maimai?.songs),
      chunithm.fetch(hashes?.chunithm?.songs),
    ]);

    set({ maimai, chunithm });
  },
}));

export default useSongListStore;
