import { Score, MaimaiScoreProps } from "./Score.tsx";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { ScoreModal } from "./ScoreModal.tsx";
import { SimpleGrid } from "@mantine/core";
import { MaimaiSongList } from "../../../utils/api/song/maimai.tsx";

interface ScoreListProps {
  scores: MaimaiScoreProps[];
  songList: MaimaiSongList;
  onScoreChange?: (score: MaimaiScoreProps) => void;
  onCreateScore?: (score: MaimaiScoreProps) => void;
}

export const MaimaiScoreList = ({ scores, songList, onScoreChange, onCreateScore }: ScoreListProps) => {
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [scoreDetail, setScoreDetail] = useState<MaimaiScoreProps | null>(null);

  return (
    <>
      <ScoreModal
        score={scoreDetail as MaimaiScoreProps}
        song={(scoreDetail ? songList.find(scoreDetail.id) : null) as any}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) onScoreChange && onScoreChange(score);
        }}
        onCreateScore={(score) => {
          closeScoreAlert();
          onCreateScore && onCreateScore(score);
        }}
      />
      <SimpleGrid cols={2} spacing="xs" w="100%">
        {scores.map((score) => (
          <Score
            key={`score-${score.id}-${score.type}-${score.level_index}`}
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