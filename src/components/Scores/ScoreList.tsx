import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { useState } from "react";
import { BackgroundImage, Card, SimpleGrid, useComputedColorScheme } from "@mantine/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { MaimaiScoreContent } from "./maimai/Score.tsx";
import { ScoreModal } from "./ScoreModal.tsx";
import { ChunithmScoreContent } from "./chunithm/Score.tsx";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import useFixedGame from "@/hooks/useFixedGame.ts";
import classes from "./Scores.module.css";
import { getScoreSecondaryColor } from "@/utils/color.ts";
import { ASSET_URL } from "@/main.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

interface ScoreProps {
  score: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: () => void;
}

const Score = ({ score, onClick }: ScoreProps) => {
  const [game] = useFixedGame();
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state[game] })),
  )

  const computedColorScheme = useComputedColorScheme('light');
  const song = songList.find(score.id);

  let borderSize = 2;
  let levelIndex = score.level_index;
  const classNameList = [classes.card, classes.scoreCard]

  if (game === "maimai" && "type" in score && score.type === "utage") {
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
      className={classNameList.join(' ')}
      style={{
        border: `${borderSize}px solid ${getScoreSecondaryColor(game, levelIndex)}`,
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={() => onClick && onClick()}
    >
      <BackgroundImage src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song ? song.id : score.id)}.png!webp`}>
        {game === "maimai" && <MaimaiScoreContent
          score={score as MaimaiScoreProps}
          song={song as MaimaiSongProps}
        />}
        {game === "chunithm" && <ChunithmScoreContent
          score={score as ChunithmScoreProps}
          song={song as ChunithmSongProps}
        />}
      </BackgroundImage>
    </Card>
  )
}

interface ScoreListProps {
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  onScoreChange?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreList = ({ scores, onScoreChange }: ScoreListProps) => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const [ref] = useAutoAnimate();
  const [score, setScore] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [opened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const small = useMediaQuery('(max-width: 25rem)');

  return (
    <>
      <ScoreModal
        game={game}
        score={score}
        opened={opened}
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
            onClick={() => {
              setScore(score);
              openScoreAlert();
            }}
          />
        })}
      </SimpleGrid>
    </>
  );
}