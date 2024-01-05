import { Score, MaimaiScoreProps } from "./Score.tsx";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { ScoreModal } from "./ScoreModal.tsx";
import { SimpleGrid } from "@mantine/core";
import { MaimaiSongList } from "../../../utils/api/song/maimai.tsx";

export const MaimaiScoreList = ({ scores, songList }: { scores: MaimaiScoreProps[], songList: MaimaiSongList }) => {
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [scoreDetail, setScoreDetail] = useState<MaimaiScoreProps | null>(null);

  return (
    <>
      <ScoreModal
        score={scoreDetail as MaimaiScoreProps}
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