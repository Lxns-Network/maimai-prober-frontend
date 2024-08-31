import { create } from 'zustand'
import { AliasList } from "../utils/api/alias.tsx";

interface AliasListState {
  maimai: AliasList,
  chunithm: AliasList,
  getAliasList: (game: 'maimai' | 'chunithm') => AliasList,
  fetchAliasList: () => Promise<void>,
}

const useAliasListStore = create<AliasListState>((set, get) => ({
  maimai: new AliasList('maimai'),
  chunithm: new AliasList('chunithm'),
  getAliasList: (game) => get()[game],
  fetchAliasList: async () => {
    await Promise.all([get().maimai.fetch(), get().chunithm.fetch()]);

    set({
      getAliasList: (game: 'maimai' | 'chunithm') => get()[game],
    });
  },
}))

export default useAliasListStore;