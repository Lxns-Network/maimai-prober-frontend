import { Score, MaimaiScoreProps } from "./Score.tsx";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useState } from "react";
import { SimpleGrid } from "@mantine/core";
import { MaimaiSongList } from "../../../utils/api/song/maimai.tsx";
import { ScoreModal } from "../ScoreModal.tsx";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface ScoreListProps {
  scores: MaimaiScoreProps[];
  songList: MaimaiSongList;
  onScoreChange?: (score: MaimaiScoreProps) => void;
}

export const MaimaiScoreList = ({ scores, songList, onScoreChange }: ScoreListProps) => {
  const [parent] = useAutoAnimate();
  const [scoreDetail, setScoreDetail] = useState<MaimaiScoreProps | null>(null);
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const small = useMediaQuery('(max-width: 25rem)');

  return (
    <>
      <ScoreModal
        game="maimai"
        score={scoreDetail}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) onScoreChange && onScoreChange(score as MaimaiScoreProps);
        }}
      />
      <SimpleGrid cols={small ? 1 : 2} spacing="xs" w="100%" ref={parent}>
        {scores.map((score) => (
          <Score
            key={`score-${score.id}-${score.type}-${score.level_index}`}
            score={score}
            song={songList.find(score.id)}
            onClick={() => {
              setScoreDetail(score);
              openScoreAlert();
            }}
          />
        ))}
      </SimpleGrid>
    </>
  );
}