import { create } from 'zustand'
import { AliasList } from "../utils/api/alias.ts";
import { Game } from "@/types/game";

interface AliasListState {
  maimai: AliasList,
  chunithm: AliasList,
  getAliasList: (game: Game) => AliasList,
  fetchAliasList: () => Promise<void>,
}

const useAliasListStore = create<AliasListState>((set, get) => ({
  maimai: new AliasList('maimai'),
  chunithm: new AliasList('chunithm'),
  getAliasList: (game) => get()[game],
  fetchAliasList: async () => {
    await Promise.all([get().maimai.fetch(), get().chunithm.fetch()]);

    set({
      getAliasList: (game: Game) => get()[game],
    });
  },
}))

export default useAliasListStore;