import { create } from 'zustand'
import { AliasList } from "../utils/api/alias.tsx";

interface AliasListState {
  maimai: AliasList,
  chunithm: AliasList,
  getAliasList: (game: 'maimai' | 'chunithm') => AliasList,
  fetchAliasList: () => Promise<void>,
}

const useAliasListStore = create<AliasListState>((_, get) => ({
  maimai: new AliasList(),
  chunithm: new AliasList(),
  getAliasList: (game) => get()[game],
  fetchAliasList: async () => {
    await get().maimai.fetch('maimai');
    await get().chunithm.fetch('chunithm');
  },
}))

export default useAliasListStore;