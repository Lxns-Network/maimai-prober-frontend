import { create } from "zustand";
import { MaimaiScoreProps, ChunithmScoreProps } from "@/types/score";
import { Game } from "@/types/game";

type OpenModalOptions = {
  game: Game;
  score?: MaimaiScoreProps | ChunithmScoreProps | null;
  onClose?: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
};

type ModalState = {
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  opened: boolean;
  game: Game;
  onClose?: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;

  openModal: (options: OpenModalOptions) => void;
  closeModal: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
};

const useScoreStore = create<ModalState>((set, get) => ({
  score: null,
  opened: false,
  game: "maimai",

  openModal: ({ game, score = null, onClose }) =>
    set({ opened: true, game, score, onClose }),

  closeModal: (score?: MaimaiScoreProps | ChunithmScoreProps) => {
    const { onClose } = get();
    if (onClose) onClose(score);
    set({ opened: false, onClose: undefined });
  },
}));

export default useScoreStore;