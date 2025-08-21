import { create } from "zustand";
import { Game } from "@/types/game";

type OpenModalOptions = {
  game: Game;
  songId?: number | null;
  onClose?: (values?: unknown) => void;
};

type ModalState = {
  songId: number | null;
  opened: boolean;
  game: Game;
  onClose?: () => void;

  openModal: (options: OpenModalOptions) => void;
  closeModal: (values?: unknown) => void;
};

const useAliasStore = create<ModalState>((set) => ({
  songId: null,
  opened: false,
  game: "maimai",

  openModal: ({ game, songId = null, onClose }) =>
    set({ opened: true, game, songId, onClose }),

  closeModal: () =>
    set({ opened: false, onClose: undefined }),
}));

export default useAliasStore;