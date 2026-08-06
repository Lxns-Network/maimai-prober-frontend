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
  onClose?: (values?: unknown) => void;

  openModal: (options: OpenModalOptions) => void;
  closeModal: (values?: unknown) => void;
};

const useAliasStore = create<ModalState>((set, get) => ({
  songId: null,
  opened: false,
  game: "maimai",

  openModal: ({ game, songId = null, onClose }) => set({ opened: true, game, songId, onClose }),

  closeModal: (values) => {
    const onClose = get().onClose;
    set({ opened: false, onClose: undefined });
    onClose?.(values);
  },
}));

export default useAliasStore;
