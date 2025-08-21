import { create } from "zustand";
import { MaimaiScoreProps, ChunithmScoreProps } from "@/types/score";
import { Game } from "@/types/game";

type OpenModalOptions = {
  game: Game;
  score?: MaimaiScoreProps | ChunithmScoreProps | null;
  onClose?: (values: unknown) => void;
};

type ModalState = {
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  opened: boolean;
  game: Game;
  onClose?: (values?: unknown) => void;

  openModal: (options: OpenModalOptions) => void;
  closeModal: (values?: unknown) => void;
};

const useCreateScoreStore = create<ModalState>((set, get) => ({
  score: null,
  opened: false,
  game: "maimai",

  openModal: ({ game, score = null, onClose }) =>
    set({ opened: true, game, score, onClose }),

  closeModal: (values: unknown) => {
    const { onClose } = get();
    if (onClose) onClose(values);
    set({ opened: false, onClose: undefined });
  },
}));

export default useCreateScoreStore;