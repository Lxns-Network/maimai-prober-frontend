import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { useContext, useState } from "react";
import { BackgroundImage, Card, SimpleGrid, useComputedColorScheme } from "@mantine/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { MaimaiScoreContent, MaimaiScoreProps } from "./maimai/Score.tsx";
import { ScoreModal } from "./ScoreModal.tsx";
import { ChunithmScoreContent, ChunithmScoreProps } from "./chunithm/Score.tsx";
import { MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { ApiContext } from "../../App.tsx";
import useStoredGame from "../../hooks/useStoredGame.tsx";
import classes from "./Scores.module.css";
import { getScoreSecondaryColor } from "../../utils/color.tsx";
import { ASSET_URL } from "../../main.tsx";

interface ScoreProps {
  score: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: () => void;
}

const Score = ({ score, onClick }: ScoreProps) => {
  const [game] = useStoredGame();

  const computedColorScheme = useComputedColorScheme('light');
  const context = useContext(ApiContext);
  const songList = context.songList[game] as MaimaiSongList | ChunithmSongList;
  const song = songList.find(score.id);

  let borderSize = 2;
  let levelIndex = score.level_index;
  let classNameList = [classes.card, classes.scoreCard]

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