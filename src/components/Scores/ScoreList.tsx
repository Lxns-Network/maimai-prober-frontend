import { BackgroundImage, Card, SimpleGridProps, useComputedColorScheme } from "@mantine/core";
import { AnimatedGrid } from "@/components/AnimatedGrid.tsx";
import { MaimaiScoreContent } from "./maimai/Score.tsx";
import { ChunithmScoreContent } from "./chunithm/Score.tsx";
import useFixedGame from "@/hooks/useFixedGame.ts";
import classes from "./Scores.module.css";
import { getScoreSecondaryColor } from "@/utils/color.ts";
import { ASSET_URL } from "@/main";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import { openScoreModal } from "./openScoreModal";

interface ScoreProps {
  score: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: () => void;
}

type ScoreCardProps = (
  | { game: "maimai"; score: MaimaiScoreProps }
  | { game: "chunithm"; score: ChunithmScoreProps }
) & { onClick?: () => void };

export const ScoreCard = ({ game, score, onClick }: ScoreCardProps) => {
  const { maimai, chunithm } = useSongListStore(
    useShallow((state) => ({ maimai: state.maimai, chunithm: state.chunithm })),
  );
  const songList = game === "maimai" ? maimai : chunithm;

  const computedColorScheme = useComputedColorScheme("light");

  let borderSize = 2;
  let levelIndex = score.level_index;
  const classNameList = [classes.card, classes.scoreCard];

  if (game === "maimai" && score.type === "utage") {
    levelIndex = 5;
  } else if (game === "chunithm" && score.id >= 8000) {
    borderSize = 0;
    classNameList.push(classes.scoreWorldsEnd);
  }

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      h={84.5}
      className={classNameList.join(" ")}
      style={{
        border: `${borderSize}px solid ${getScoreSecondaryColor(game, levelIndex)}`,
        opacity: computedColorScheme === "dark" ? 0.8 : 1,
      }}
      onClick={() => onClick && onClick()}
    >
      <BackgroundImage
        src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(score.id)}.png!webp`}
      >
        {game === "maimai" && <MaimaiScoreContent score={score} song={maimai.find(score.id)} />}
        {game === "chunithm" && (
          <ChunithmScoreContent score={score} song={chunithm.find(score.id)} />
        )}
      </BackgroundImage>
    </Card>
  );
};

const Score = ({ score, onClick }: ScoreProps) => {
  const [game] = useFixedGame();
  if (game === "maimai" && "type" in score) {
    return <ScoreCard game="maimai" score={score} onClick={onClick} />;
  }
  if (game === "chunithm" && !("type" in score)) {
    return <ScoreCard game="chunithm" score={score} onClick={onClick} />;
  }
  return null;
};

interface ScoreListProps {
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  onScoreChange?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
  cols?: SimpleGridProps["cols"];
  /** 展示他人成绩时开启，成绩详情弹窗不提供针对当前账号的操作。 */
  readOnly?: boolean;
}

const keyOf = (score: MaimaiScoreProps | ChunithmScoreProps) =>
  `${score.id}:${"type" in score && score.type}:${score.level_index}`;

export const ScoreList = ({ scores, onScoreChange, cols, readOnly }: ScoreListProps) => {
  const [game] = useGame();

  const handleOpenScoreModal = (score: MaimaiScoreProps | ChunithmScoreProps) => {
    openScoreModal({
      game,
      score,
      readOnly,
      onClose: (score) => {
        score && onScoreChange && onScoreChange(score);
      },
    });
  };

  return (
    <AnimatedGrid
      items={scores}
      getKey={keyOf}
      cols={cols ?? { base: 1, "400px": 2, "700px": 3 }}
      renderItem={(score) => <Score score={score} onClick={() => handleOpenScoreModal(score)} />}
    />
  );
};
