import { Score, ChunithmScoreProps } from "./Score.tsx";
import { SimpleGrid } from "@mantine/core";
import { ChunithmSongList } from "../../../utils/api/song/chunithm.tsx";
import { ScoreModal } from "./ScoreModal.tsx";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

interface ScoreListProps {
  scores: ChunithmScoreProps[];
  songList: ChunithmSongList;
  onScoreChange?: (score: ChunithmScoreProps) => void;
}

export const ChunithmScoreList = ({ scores, songList, onScoreChange }: ScoreListProps) => {
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [scoreDetail, setScoreDetail] = useState<ChunithmScoreProps | null>(null);

  return (
    <>
      <ScoreModal
        score={scoreDetail as ChunithmScoreProps}
        song={(scoreDetail ? songList.find(scoreDetail.id) : null) as any}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) onScoreChange && onScoreChange(score);
        }}
      />
      <SimpleGrid
        cols={2}
        spacing="xs"
        w="100%"
      >
        {scores.map((score) => (
          <Score
            key={`score-${score.id}-${score.level_index}`}
            score={score}
            song={songList.find(score.id) as any}
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