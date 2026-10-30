import { create } from "zustand";

interface FriendUIStore {
  addOpened: boolean;
  blocksOpened: boolean;
  /** 好友页最近一次的查询串（含 `?`），资料页的返回按钮据此回到来源 tab 并恢复列表的搜索、排序与页码。 */
  listSearch: string;

  openAdd: () => void;
  closeAdd: () => void;
  openBlocks: () => void;
  closeBlocks: () => void;
  setListSearch: (search: string) => void;
}

const useFriendStore = create<FriendUIStore>((set) => ({
  addOpened: false,
  blocksOpened: false,
  listSearch: "",

  openAdd: () => set({ addOpened: true }),
  closeAdd: () => set({ addOpened: false }),
  openBlocks: () => set({ blocksOpened: true }),
  closeBlocks: () => set({ blocksOpened: false }),
  setListSearch: (listSearch) => set({ listSearch }),
}));

export default useFriendStore;
