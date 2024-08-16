import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { useContext, useState } from "react";
import { SimpleGrid } from "@mantine/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { MaimaiScore, MaimaiScoreProps } from "./maimai/Score.tsx";
import { ScoreModal } from "./ScoreModal.tsx";
import { ChunithmScore, ChunithmScoreProps } from "./chunithm/Score.tsx";
import { MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { ApiContext } from "../../App.tsx";
import useStoredGame from "../../hooks/useStoredGame.tsx";

interface ScoreProps {
  score: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
}

const Score = ({ score, onClick }: ScoreProps) => {
  const [game] = useStoredGame();

  const context = useContext(ApiContext);
  const songList = context.songList[game] as MaimaiSongList | ChunithmSongList;
  let song = songList.find(score.id);

  if (game === "maimai" && "type" in score) {
    song = song as MaimaiSongProps;

    return <MaimaiScore
      key={`${score.id}:${score.type}:${score.level_index}`}
      score={score}
      song={song}
      onClick={() => {
        onClick && onClick(score);
      }}
    />
  } else if (game === "chunithm") {
    score = score as ChunithmScoreProps
    song = song as ChunithmSongProps;

    return <ChunithmScore
      key={`${score.id}:${score.level_index}`}
      score={score}
      song={song}
      onClick={() => {
        onClick && onClick(score);
      }}
    />
  }
}

interface ScoreListProps {
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  onScoreChange?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreList = ({ scores, onScoreChange }: ScoreListProps) => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const [ref] = useAutoAnimate();
  const [scoreDetail, setScoreDetail] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const small = useMediaQuery('(max-width: 25rem)');

  return (
    <>
      <ScoreModal
        game={game}
        score={scoreDetail}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) onScoreChange && onScoreChange(score as MaimaiScoreProps);
        }}
      />
      <SimpleGrid cols={small ? 1 : 2} spacing="xs" w="100%" ref={ref}>
        {scores.map((score) => {
          return <Score
            key={`${score.id}:${"type" in score && score.type}:${score.level_index}`}
            score={score}
            onClick={(score) => {
              setScoreDetail(score);
              openScoreAlert();
            }}
          />
        })}
      </SimpleGrid>
    </>
  );
}