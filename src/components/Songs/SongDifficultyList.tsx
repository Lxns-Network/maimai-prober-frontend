import useFixedGame from "@/hooks/useFixedGame.ts";
import { ChunithmDifficultyProps, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import {
  MaimaiDifficultiesProps,
  MaimaiDifficultyProps,
  MaimaiSongProps,
} from "@/utils/api/song/maimai.ts";
import { ChunithmSongDifficulty } from "./chunithm/SongDifficulty.tsx";
import { MaimaiSongDifficulty } from "./maimai/SongDifficulty.tsx";
import React, { useMemo, useState } from "react";
import { Chip, Group, Stack } from "@mantine/core";
import { AnimatedStack } from "@/components/AnimatedGrid.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import useScoreStore from "@/hooks/useScoreStore.ts";

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
  );

  if (game === "maimai") {
    difficulty = difficulty as MaimaiDifficultyProps;
    score = score as MaimaiScoreProps;

    return (
      <MaimaiSongDifficulty
        difficulty={difficulty}
        score={score}
        songId={song.id}
        versions={versions}
        onClick={() => {
          difficulty = difficulty as MaimaiDifficultyProps;

          onClick &&
            onClick(
              score ||
                ({
                  id: song.id,
                  type: difficulty.type,
                  level_index: difficulty.difficulty,
                  achievements: -1,
                } as MaimaiScoreProps),
            );
        }}
      />
    );
  } else if (game === "chunithm") {
    difficulty = difficulty as ChunithmDifficultyProps;
    score = score as ChunithmScoreProps;

    return (
      <ChunithmSongDifficulty
        difficulty={difficulty}
        score={score}
        versions={versions}
        onClick={() => {
          onClick &&
            onClick(
              score ||
                ({
                  id: song.id,
                  level_index: difficulty.difficulty,
                  score: -1,
                } as ChunithmScoreProps),
            );
        }}
      />
    );
  }
};

interface SongDifficultiesProps {
  song: MaimaiSongProps | ChunithmSongProps | null;
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  setScores: React.Dispatch<React.SetStateAction<(MaimaiScoreProps | ChunithmScoreProps)[]>>;
  style?: React.CSSProperties;
}

const maimaiDifficultyTypeData = [
  {
    value: "standard",
    label: "标准",
    color: "blue",
  },
  {
    value: "dx",
    label: "DX",
    color: "orange",
  },
  {
    value: "utage",
    label: "宴会场",
    color: "pink",
  },
];

export const SongDifficultyList = ({ song, scores, setScores, style }: SongDifficultiesProps) => {
  const [game] = useGame();
  const [difficultyType, setDifficultyType] = useState<"standard" | "dx" | "utage">();

  const { openModal: openScoreModal } = useScoreStore();

  const { difficulties, effectiveType } = useMemo<{
    difficulties: (MaimaiDifficultyProps | ChunithmDifficultyProps)[];
    effectiveType: "standard" | "dx" | "utage" | undefined;
  }>(() => {
    if (!song || !song.difficulties) {
      return { difficulties: [], effectiveType: undefined };
    }
    if ("standard" in song.difficulties) {
      const maimaiDiffs = song.difficulties as MaimaiDifficultiesProps;
      const types = ["standard", "dx", "utage"] as const;
      const type =
        difficultyType && (maimaiDiffs[difficultyType]?.length ?? 0) > 0
          ? difficultyType
          : types.find((t) => (maimaiDiffs[t]?.length ?? 0) > 0);
      return {
        difficulties: type ? maimaiDiffs[type].slice().reverse() : [],
        effectiveType: type,
      };
    }
    return {
      difficulties: (song.difficulties as ChunithmDifficultyProps[]).slice().reverse(),
      effectiveType: undefined,
    };
  }, [song, difficultyType]);

  const handleOpenScoreModal = (score: MaimaiScoreProps | ChunithmScoreProps) => {
    openScoreModal({
      game,
      score,
      onClose: (score) => {
        score &&
          setScores((prev: (MaimaiScoreProps | ChunithmScoreProps)[]) => {
            const index = prev.findIndex(
              (record) =>
                record.id === score.id &&
                record.level_index === score.level_index &&
                (!("type" in record) || !("type" in score) || record.type === score.type),
            );
            if (index >= 0) {
              return prev.map((record, recordIndex) => (recordIndex === index ? score : record));
            } else {
              return [...prev, score];
            }
          });
      },
    });
  };

  return (
    <Stack style={style}>
      {game === "maimai" && song && song.difficulties && (
        <Chip.Group
          multiple={false}
          value={effectiveType}
          onChange={(value) => setDifficultyType(value as "standard" | "dx" | "utage")}
        >
          <Group justify="center">
            {maimaiDifficultyTypeData.map((type) => {
              const s = song as MaimaiSongProps;
              const d = s.difficulties[type.value as keyof MaimaiDifficultiesProps];
              if (!d || d.length === 0) return null;
              return (
                <Chip key={type.value} value={type.value} color={type.color}>
                  {type.label}
                </Chip>
              );
            })}
          </Group>
        </Chip.Group>
      )}
      <AnimatedStack
        items={song ? difficulties : []}
        getKey={(difficulty) =>
          game === "maimai" && "type" in difficulty
            ? `${song!.id}:${difficulty.type}:${difficulty.difficulty}`
            : `${song!.id}:${difficulty.difficulty}`
        }
        renderItem={(difficulty) => (
          <SongDifficulty
            song={song!}
            difficulty={difficulty}
            score={scores.find((record) =>
              game === "maimai" && "type" in difficulty
                ? (record as MaimaiScoreProps).type === difficulty.type &&
                  record.level_index === difficulty.difficulty
                : record.level_index === difficulty.difficulty,
            )}
            onClick={handleOpenScoreModal}
          />
        )}
      />
    </Stack>
  );
};
