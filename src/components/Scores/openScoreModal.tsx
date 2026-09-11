import { useOverlayNavigationStore } from "@/hooks/useOverlayNavigationStore";
import { type Game } from "@/types/game";
import { type ChunithmScoreProps, type MaimaiScoreProps } from "@/types/score";
import { ScoreModal } from "./ScoreModal";

export function openScoreModal({
  game,
  score = null,
  readOnly,
  onClose,
}: {
  game: Game;
  score?: MaimaiScoreProps | ChunithmScoreProps | null;
  readOnly?: boolean;
  onClose?: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}) {
  useOverlayNavigationStore.getState().openOverlay<MaimaiScoreProps | ChunithmScoreProps>({
    returnLabel: "返回成绩详情",
    onClose,
    render: (controls) => (
      <ScoreModal {...controls} game={game} score={score} readOnly={readOnly} />
    ),
  });
}
