import { Score, ChunithmScoreProps } from "./Score.tsx";
import { SimpleGrid } from "@mantine/core";
import { ChunithmSongList } from "../../../utils/api/song/chunithm.tsx";

export const ChunithmScoreList = ({ scores, songList }: { scores: ChunithmScoreProps[], songList: ChunithmSongList }) => {
  return (
    <>
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
            }}
          />
        ))}
      </SimpleGrid>
    </>
  );
}