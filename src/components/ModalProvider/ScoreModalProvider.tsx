import useScoreStore from "@/hooks/useScoreStore.ts";
import { ScoreModal } from "../Scores/ScoreModal.tsx";

export function ScoreModalProvider() {
  const { opened, game, score, closeModal } = useScoreStore();

  return (
    <ScoreModal
      game={game}
      score={score}
      opened={opened}
      onClose={(score) => closeModal(score)}
    />
  );
}