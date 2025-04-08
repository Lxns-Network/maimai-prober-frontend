import useFixedGame from "@/hooks/useFixedGame.ts";
import { ChunithmDifficultyProps, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { MaimaiDifficultiesProps, MaimaiDifficultyProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongDifficulty } from "./chunithm/SongDifficulty.tsx";
import { MaimaiSongDifficulty } from "./maimai/SongDifficulty.tsx";
import React, { useEffect, useState } from "react";
import { ScoreModal } from "../Scores/ScoreModal.tsx";
import { useDisclosure } from "@mantine/hooks";
import { Chip, Group, Stack } from "@mantine/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";

interface SongDifficultyProps {
  song: MaimaiSongProps | ChunithmSongProps;
  difficulty: MaimaiDifficultyProps | ChunithmDifficultyProps;
  score?: MaimaiScoreProps | ChunithmScoreProps;
  onClick?: (score: MaimaiScoreProps | ChunithmScoreProps) => void;
}

const SongDifficulty = ({ song, difficulty, score, onClick }: SongDifficultyProps) => {
  const [game] = useFixedGame();
  const { versions } = useSongListStore(
    useShallow((state) => ({ versions: state[game].versions })),
  )

  if (game === "maimai") {
    difficulty = difficulty as MaimaiDifficultyProps;
    score = score as MaimaiScoreProps;

    return <MaimaiSongDifficulty
      difficulty={difficulty}
      score={score}
      versions={versions}
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
      versions={versions}
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

const maimaiDifficultyTypeData = [{
  value: "standard",
  label: "标准",
  color: "blue",
}, {
  value: "dx",
  label: "DX",
  color: "orange",
}, {
  value: "utage",
  label: "宴会场",
  color: "pink",
}]

export const SongDifficultyList = ({ song, scores, setScores, style }: SongDifficultiesProps) => {
  const [game] = useGame();
  const [difficulties, setDifficulties] = useState<(MaimaiDifficultyProps | ChunithmDifficultyProps)[]>([]);
  const [difficultyType, setDifficultyType] = useState<"standard" | "dx" | "utage">();
  const [score, setScore] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [opened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [ref] = useAutoAnimate();

  useEffect(() => {
    setDifficulties([]);
  }, [game]);

  useEffect(() => {
    if (!song || !song.difficulties) return;

    if ("standard" in song.difficulties) {
      song = song as MaimaiSongProps;
      Object.keys(song.difficulties).forEach((type) => {
        const s = song as MaimaiSongProps;
        const d = s.difficulties[type as keyof MaimaiDifficultiesProps];
        if (d && d.length > 0) {
          setDifficultyType(type as "standard" | "dx" | "utage");
          return;
        }
      });
    } else {
      setDifficulties((song.difficulties as ChunithmDifficultyProps[]).slice().reverse());
    }
  }, [song]);

  useEffect(() => {
    if (!song || !song.difficulties) return;

    if ("standard" in song.difficulties) {
      if (difficultyType && difficultyType in song.difficulties) {
        setDifficulties((song.difficulties as MaimaiDifficultiesProps)[difficultyType || "standard"].slice().reverse());
      }
    }
  }, [song, difficultyType]);

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
        {game === "maimai" && song && song.difficulties && (
          <Chip.Group multiple={false} value={difficultyType} onChange={(value) => setDifficultyType(value as "standard" | "dx" | "utage")}>
            <Group justify="center">
              {maimaiDifficultyTypeData.map((type) => {
                const s = song as MaimaiSongProps;
                const d = s.difficulties[type.value as keyof MaimaiDifficultiesProps]
                if (!d || d.length === 0) return null;
                return <Chip key={type.value} value={type.value} color={type.color}>{type.label}</Chip>
              })}
            </Group>
          </Chip.Group>
        )}
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