import { useMemo } from "react";
import { MaimaiDifficultyProps, MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import useGame from "@/hooks/useGame.ts";
import { ScoreFilters } from "@/hooks/useScoreFilters.ts";

export const scoreRatingRanges: Record<Game, [number, number]> = {
  maimai: [1, 15],
  chunithm: [1, 16],
};

// 统计已启用的筛选组数量，用于工具栏筛选按钮的角标
export function countActiveFilters(filters: ScoreFilters, ratingRange: [number, number]) {
  let count = 0;
  if (filters.difficulty.length > 0) count++;
  if (filters.type.length > 0) count++;
  if (filters.genre.length > 0) count++;
  if (filters.version.length > 0) count++;
  if (filters.uploadTime[0] || filters.uploadTime[1]) count++;
  if (filters.endRating[0] !== ratingRange[0] || filters.endRating[1] !== ratingRange[1]) count++;
  if (filters.fullCombo.length > 0) count++;
  if (filters.fullSync.length > 0) count++;
  if (filters.deluxeStar.length > 0) count++;
  if (filters.showUnplayed) count++;
  return count;
}

export function useFilteredScores(
  scores: (MaimaiScoreProps | ChunithmScoreProps)[],
  filters: ScoreFilters,
  isDefault: boolean,
) {
  const [game] = useGame();
  const getSongList = useSongListStore((state) => state.getSongList);
  const songList = getSongList(game);

  const {
    difficulty,
    type,
    genre,
    version,
    endRating,
    fullCombo,
    fullSync,
    deluxeStar,
    uploadTime,
    showUnplayed,
  } = filters;

  return useMemo(() => {
    if (!scores) return [];

    let filteredData = [...scores];

    if (showUnplayed) {
      if (songList instanceof MaimaiSongList) {
        const scoreKeys = new Set(
          filteredData.map(
            (item) => `${item.id}-${(item as MaimaiScoreProps).type}-${item.level_index}`,
          ),
        );

        songList.songs.forEach((song) => {
          Object.entries(song.difficulties).forEach(([type, difficulties]) => {
            if (!difficulties) return;
            difficulties.forEach((difficulty: MaimaiDifficultyProps) => {
              if (!scoreKeys.has(`${song.id}-${type}-${difficulty.difficulty}`))
                filteredData.push({
                  id: song.id,
                  song_name: song.title,
                  level: difficulty.level,
                  level_index: difficulty.difficulty,
                  achievements: -1,
                  type,
                } as MaimaiScoreProps);
            });
          });
        });
      } else if (songList instanceof ChunithmSongList) {
        const scoreKeys = new Set(filteredData.map((item) => `${item.id}-${item.level_index}`));

        songList.songs.forEach((song) => {
          song.difficulties.forEach((difficulty) => {
            if (!scoreKeys.has(`${song.id}-${difficulty.difficulty}`))
              filteredData.push({
                id: song.id,
                song_name: song.title,
                level: difficulty.level,
                level_index: difficulty.difficulty,
                score: -1,
              } as ChunithmScoreProps);
          });
        });
      }
    }

    // 如果没有任何筛选条件，直接返回
    if (isDefault) {
      return filteredData;
    }

    // 不需要 song 和 difficulty 信息，提前过滤掉可以减少后续的计算量
    filteredData = filteredData.filter((score) => {
      if (songList instanceof MaimaiSongList) {
        score = score as MaimaiScoreProps;
        if (type.length > 0 && !type.includes(score.type) && score.type !== "utage") {
          // 过滤谱面类型
          return false;
        }
        if (fullCombo.length > 0) {
          // 过滤 Full Combo
          const matchNoFc = fullCombo.includes("nofc") && !score.fc;
          const matchFc = fullCombo.filter((v) => v !== "nofc").includes(score.fc);
          if (!matchNoFc && !matchFc) return false;
        }
        if (fullSync.length > 0) {
          // 过滤 Full Sync
          const matchNoFs = fullSync.includes("nofs") && !score.fs;
          const matchFs = fullSync.filter((v) => v !== "nofs").includes(score.fs);
          if (!matchNoFs && !matchFs) return false;
        }
        if (deluxeStar.length > 0 && !deluxeStar.includes(score.dx_star)) {
          // 过滤 DX 星级
          return false;
        }
        // 宴谱的 level_index 基本都是 0，需要提前过滤
        if (score.type === "utage" && (difficulty.includes("5") || difficulty.length === 0)) {
          return true;
        }
      } else {
        score = score as ChunithmScoreProps;
        if (fullCombo.length > 0) {
          // 过滤 Full Combo
          const matchNoFc = fullCombo.includes("nofullcombo") && !score.full_combo;
          const matchFc = fullCombo.filter((v) => v !== "nofullcombo").includes(score.full_combo);
          if (!matchNoFc && !matchFc) return false;
        }
        if (fullSync.length > 0) {
          // 过滤 Full Chain
          const matchNoChain = fullSync.includes("nofullchain") && !score.full_chain;
          const matchChain = fullSync.filter((v) => v !== "nofullchain").includes(score.full_chain);
          if (!matchNoChain && !matchChain) return false;
        }
      }
      return difficulty.includes(score.level_index.toString()) || difficulty.length === 0; // 过滤难度
    });

    // 过滤乐曲分类、版本和定数
    filteredData = filteredData.filter((score) => {
      if (!songList) return false;

      let song = songList.find(score.id);
      if (!song) return false;

      let matchGenre, matchVersion, matchRating;

      if (songList instanceof MaimaiSongList) {
        song = song as MaimaiSongProps;
        score = score as MaimaiScoreProps;

        const difficulty = songList.getDifficulty(song, score.type, score.level_index);
        if (!difficulty) return false;

        matchGenre =
          genre.some(
            (selected) =>
              songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre,
          ) || genre.length === 0; // 过滤乐曲分类
        matchVersion =
          version.some(
            (selected) =>
              difficulty.version >= selected &&
              difficulty.version <
                (songList.versions[
                  songList.versions.findIndex((value) => value.version === selected) + 1
                ]?.version || selected + 1000),
          ) || version.length === 0; // 过滤版本
        matchRating =
          (difficulty.level_value >= endRating[0] && difficulty.level_value <= endRating[1]) ||
          (endRating.every((v, i) => v === scoreRatingRanges[game][i]) && score.type === "utage"); // 过滤定数
      } else {
        song = song as ChunithmSongProps;
        score = score as ChunithmScoreProps;

        const difficulty = songList.getDifficulty(song, score.level_index);
        if (!difficulty) return false;

        matchGenre =
          genre.some(
            (selected) =>
              songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre,
          ) || genre.length === 0; // 过滤乐曲分类
        matchVersion =
          version.some(
            (selected) =>
              difficulty.version >= selected &&
              difficulty.version <
                (songList.versions[
                  songList.versions.findIndex((value) => value.version === selected) + 1
                ]?.version || selected + 500),
          ) || version.length === 0; // 过滤版本
        matchRating =
          (difficulty.level_value >= endRating[0] && difficulty.level_value <= endRating[1]) ||
          (endRating.every((v, i) => v === scoreRatingRanges[game][i]) && score.level_index === 5); // 过滤定数
      }

      return matchGenre && matchVersion && matchRating;
    });

    // 过滤上传时间
    const startTime = uploadTime[0] ? new Date(uploadTime[0]).getTime() : null;
    const endTime = uploadTime[1] ? new Date(uploadTime[1]).getTime() : null;

    filteredData = filteredData.filter((score) => {
      const t = Date.parse(score.upload_time);
      if (startTime && t < startTime) return false;
      if (endTime && t >= endTime + 24 * 60 * 60 * 1000) return false;
      return true;
    });

    return filteredData;
  }, [filters, game, isDefault, scores, songList]);
}
