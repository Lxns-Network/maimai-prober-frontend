import { create } from "zustand";
import { AliasList } from "../utils/api/alias.ts";

interface AliasListState {
  maimai: AliasList;
  chunithm: AliasList;
  fetchAliasList: () => Promise<void>;
}

const useAliasListStore = create<AliasListState>((set) => ({
  maimai: new AliasList("maimai"),
  chunithm: new AliasList("chunithm"),
  fetchAliasList: async () => {
    const nextMaimai = new AliasList("maimai");
    const nextChunithm = new AliasList("chunithm");
    const [maimaiResult, chunithmResult] = await Promise.allSettled([
      nextMaimai.fetch(),
      nextChunithm.fetch(),
    ]);

    set((state) => ({
      maimai: maimaiResult.status === "fulfilled" ? nextMaimai : state.maimai,
      chunithm: chunithmResult.status === "fulfilled" ? nextChunithm : state.chunithm,
    }));

    const failures = [maimaiResult, chunithmResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      throw new Error(failures.map((result) => String(result.reason)).join("；"));
    }
  },
}));

export default useAliasListStore;
