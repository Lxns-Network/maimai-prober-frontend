import { Score, ChunithmScoreProps } from "./Score.tsx";
import { SimpleGrid } from "@mantine/core";
import { ChunithmSongList } from "../../../utils/api/song/chunithm.tsx";
import { useMediaQuery, useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { ScoreModal } from "../ScoreModal.tsx";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface ScoreListProps {
  scores: ChunithmScoreProps[];
  songList: ChunithmSongList;
  onScoreChange?: (score: ChunithmScoreProps) => void;
}

export const ChunithmScoreList = ({ scores, songList, onScoreChange }: ScoreListProps) => {
  const [parent] = useAutoAnimate();
  const [scoreDetail, setScoreDetail] = useState<ChunithmScoreProps | null>(null);
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const small = useMediaQuery('(max-width: 25rem)');

  return (
    <>
      <ScoreModal
        game="chunithm"
        score={scoreDetail}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) onScoreChange && onScoreChange(score as ChunithmScoreProps);
        }}
      />
      <SimpleGrid cols={small ? 1 : 2} spacing="xs" w="100%" ref={parent}>
        {scores.map((score) => (
          <Score
            key={`score-${score.id}-${score.level_index}`}
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