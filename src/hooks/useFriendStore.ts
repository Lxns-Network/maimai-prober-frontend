import { create } from "zustand";

interface FriendUIStore {
  addOpened: boolean;
  blocksOpened: boolean;

  openAdd: () => void;
  closeAdd: () => void;
  openBlocks: () => void;
  closeBlocks: () => void;
}

const useFriendStore = create<FriendUIStore>((set) => ({
  addOpened: false,
  blocksOpened: false,

  openAdd: () =>
    set({
      addOpened: true,
    }),

  closeAdd: () =>
    set({
      addOpened: false,
    }),

  openBlocks: () =>
    set({
      blocksOpened: true,
    }),

  closeBlocks: () =>
    set({
      blocksOpened: false,
    }),
}));

export default useFriendStore;
