import useStoredGame from "../../hooks/useStoredGame.tsx";
import { ChunithmDifficultyProps, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { ChunithmScoreProps } from "../Scores/chunithm/Score.tsx";
import {
  MaimaiDifficultiesProps,
  MaimaiDifficultyProps,
  MaimaiSongProps
} from "../../utils/api/song/maimai.tsx";
import { MaimaiScoreProps } from "../Scores/maimai/Score.tsx";
import { ChunithmSongDifficulty } from "./chunithm/SongDifficulty.tsx";
import { MaimaiSongDifficulty } from "./maimai/SongDifficulty.tsx";
import { ApiContext } from "../../App.tsx";
import React, { useContext, useEffect, useState } from "react";
import { ScoreModal } from "../Scores/ScoreModal.tsx";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { Stack } from "@mantine/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface SongDifficultyProps {
  song: MaimaiSongProps | ChunithmSongProps;
  difficulty: MaimaiDifficultyProps | ChunithmDifficultyProps;
  score?: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
}

const SongDifficulty = ({ song, difficulty, score, onClick }: SongDifficultyProps) => {
  const [game] = useStoredGame();

  const context = useContext(ApiContext);

  if (game === "maimai") {
    difficulty = difficulty as MaimaiDifficultyProps;
    score = score as MaimaiScoreProps;

    return <MaimaiSongDifficulty
      difficulty={difficulty}
      score={score}
      versions={context.songList.maimai.versions}
      onClick={() => {
        difficulty = difficulty as MaimaiDifficultyProps;

        onClick && onClick(score || {
          id: song.id,
          type: difficulty.type,
          level_index: difficulty.difficulty,
          achievements: -1,
        } as MaimaiScoreProps);
      }}
    />
  } else if (game === "chunithm") {
    difficulty = difficulty as ChunithmDifficultyProps;
    score = score as ChunithmScoreProps;

    return <ChunithmSongDifficulty
      difficulty={difficulty}
      score={score}
      versions={context.songList.chunithm.versions}
      onClick={() => {
        onClick && onClick(score || {
          id: song.id,
          level_index: difficulty.difficulty,
          score: -1,
        } as ChunithmScoreProps);
      }}
    />
  }
}

interface SongDifficultiesProps {
  song: MaimaiSongProps | ChunithmSongProps | null;
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  setScores: (scores: any) => void;
  style?: React.CSSProperties;
}

export const SongDifficultyList = ({ song, scores, setScores, style }: SongDifficultiesProps) => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const [difficulties, setDifficulties] = useState<(MaimaiDifficultyProps | ChunithmDifficultyProps)[]>([]);
  const [score, setScore] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [opened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [ref] = useAutoAnimate();

  useEffect(() => {
    if (!song || !game) return;

    if (game === "maimai") {
      const difficulties: MaimaiDifficultyProps[] = [];
      ["standard", "dx", "utage"].forEach((type) => {
        const d = song.difficulties as MaimaiDifficultiesProps;
        const t = type as keyof MaimaiDifficultiesProps;
        if (!d || !d[t]) return null;
        return d[t].slice().reverse().map((difficulty) => (
          difficulties.push(difficulty)
        ));
      });
      setDifficulties(difficulties);
    } else if (Array.isArray(song.difficulties)) {
      setDifficulties((song.difficulties as ChunithmDifficultyProps[]).slice().reverse());
    }
  }, [song, game]);

  return (
    <>
      <ScoreModal
        game={game}
        score={score}
        opened={opened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) {
            setScores((prev: any[]) => {
              const index = prev.findIndex((record) => record.id === score.id && record.level_index === score.level_index);
              if (index >= 0) {
                prev[index] = score;
                return [...prev];
              } else {
                return [...prev, score];
              }
            });
          }
        }}
      />
      <Stack ref={ref} style={style}>
        {difficulties.map((difficulty) => {
          if (!song) return null;
          if (game === "maimai" && "type" in difficulty) {
            return <SongDifficulty
              key={`${song.id}:${difficulty.type}:${difficulty.difficulty}`}
              song={song}
              difficulty={difficulty}
              score={scores.find((record) =>
                (record as MaimaiScoreProps).type === difficulty.type && record.level_index === difficulty.difficulty)}
              onClick={(score) => {
                setScore(score);
                openScoreAlert();
              }}
            />
          } else if (game === "chunithm") {
            return <SongDifficulty
              key={`${song.id}:${difficulty.difficulty}`}
              song={song}
              difficulty={difficulty}
              score={scores.find((record) => record.level_index === difficulty.difficulty)}
              onClick={(score) => {
                setScore(score);
                openScoreAlert();
              }}
            />
          }
        })}
      </Stack>
    </>
  );
}