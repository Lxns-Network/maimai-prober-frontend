import { Score, ScoreProps } from "./Score";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { ScoreModal } from "./ScoreModal";
import { SimpleGrid } from "@mantine/core";
import { songList } from "../../pages/user/Scores.tsx";

export const ScoreList = ({ scores }: { scores: ScoreProps[] }) => {
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [scoreDetail, setScoreDetail] = useState<ScoreProps | null>(null);

  return (
    <>
      <ScoreModal
        score={scoreDetail as ScoreProps}
        song={(scoreDetail ? songList.find(scoreDetail.id) : null) as any}
        opened={scoreAlertOpened}
        onClose={closeScoreAlert}
      />
      <SimpleGrid
        cols={2}
        spacing="xs"
        w="100%"
      >
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