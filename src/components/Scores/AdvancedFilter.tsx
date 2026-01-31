import {
  Button, Chip, Flex, Grid, Group, Image, MultiSelect, NumberInput, RangeSlider, Space, Switch, Text
} from "@mantine/core";
import { IconReload } from "@tabler/icons-react";
import { MaimaiDifficultyProps, MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { useMediaQuery } from "@mantine/hooks";
import React, { useEffect, useState } from "react";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import "dayjs/locale/zh-cn";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import { useScoreFilters } from "@/hooks/useScoreFilters.ts";

const filterData = {
  maimai: {
    rating: [1, 15] as [number, number],
    difficulties: [{
      value: "0",
      label: "🟢 BASIC",
    }, {
      value: "1",
      label: "🟡 ADVANCED",
    }, {
      value: "2",
      label: "🔴 EXPERT",
    }, {
      value: "3",
      label: "🟣 MASTER",
    }, {
      value: "4",
      label:"⚪ Re:MASTER",
    }, {
      value: "5",
      label: "💮 U·TA·GE",
    }]
  },
  chunithm: {
    rating: [1, 16] as [number, number],
    difficulties: [{
      value: "0",
      label: "🟢 BASIC",
    }, {
      value: "1",
      label: "🟡 ADVANCED",
    }, {
      value: "2",
      label: "🔴 EXPERT",
    }, {
      value: "3",
      label: "🟣 MASTER",
    }, {
      value: "4",
      label: "⚫ ULTIMA",
    }, {
      value: "5",
      label: "🌈 WORLD'S END",
    }]
  }
}

const FilterChips = ({ title, value, onChange, options }: {
  title: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: { value: string; label: React.ReactNode }[];
}) => {
  return (
    <div>
      <Text fz="xs" c="dimmed" mb={3}>{title}</Text>
      <Flex rowGap="xs" columnGap="md" wrap="wrap">
        <Chip.Group multiple value={value} onChange={onChange}>
          {options.map((opt) => (
            <Chip key={opt.value} variant="filled" size="xs" value={opt.value}>
              {opt.label}
            </Chip>
          ))}
        </Chip.Group>
      </Flex>
    </div>
  );
}

export const AdvancedFilter = ({ scores, onChange }: {
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  onChange: (filteredScores: (MaimaiScoreProps | ChunithmScoreProps)[]) => void;
}) => {
  const [game] = useGame();
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [filteredScores, setFilteredScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);

  const { filters, setFilter, resetFilters, isDefault } = useScoreFilters({
    rating: filterData[game].rating,
    endRating: filterData[game].rating,
  });
  const {
    difficulty, type, genre, version, rating, endRating,
    fullCombo, fullSync, deluxeStar, uploadTime, showUnplayed,
  } = filters;

  const getSongList = useSongListStore((state) => state.getSongList);
  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    setSongList(getSongList(game));
    resetFilters();
  }, [game]);

  useEffect(() => {
    onChange(filteredScores);
  }, [filteredScores]);

  useEffect(() => {
    if (!scores) return;
    if (!rating.every((v, i)=> v === endRating[i])) {
      return;
    }

    let filteredData = [...scores];

    if (showUnplayed) {
      if (songList instanceof MaimaiSongList) {
        const scoreKeys = new Set(
          filteredData.map((item) => `${item.id}-${(item as MaimaiScoreProps).type}-${item.level_index}`));

        songList.songs.forEach((song) => {
          Object.entries(song.difficulties).forEach(([type, difficulties]) => {
            if (!difficulties) return;
            difficulties.forEach((difficulty: MaimaiDifficultyProps) => {
              if (!scoreKeys.has(`${song.id}-${type}-${difficulty.difficulty}`)) filteredData.push({
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
        const scoreKeys = new Set(
          filteredData.map((item) => `${item.id}-${item.level_index}`));

        songList.songs.forEach((song) => {
          song.difficulties.forEach((difficulty) => {
            if (!scoreKeys.has(`${song.id}-${difficulty.difficulty}`)) filteredData.push({
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
      setFilteredScores(filteredData);
      return;
    }

    // 不需要 song 和 difficulty 信息，提前过滤掉可以减少后续的计算量
    filteredData = filteredData.filter((score) => {
      if (songList instanceof MaimaiSongList) {
        score = score as MaimaiScoreProps;
        if (type.length > 0 && !type.includes(score.type) && score.type !== "utage") { // 过滤谱面类型
          return false;
        }
        if (fullCombo.length > 0) { // 过滤 Full Combo
          const matchNoFc = fullCombo.includes("nofc") && !score.fc;
          const matchFc = fullCombo.filter(v => v !== "nofc").includes(score.fc);
          if (!matchNoFc && !matchFc) return false;
        }
        if (fullSync.length > 0) { // 过滤 Full Sync
          const matchNoFs = fullSync.includes("nofs") && !score.fs;
          const matchFs = fullSync.filter(v => v !== "nofs").includes(score.fs);
          if (!matchNoFs && !matchFs) return false;
        }
        if (deluxeStar.length > 0 && !deluxeStar.includes(score.dx_star)) { // 过滤 DX 星级
          return false;
        }
        // 宴谱的 level_index 基本都是 0，需要提前过滤
        if (score.type === "utage" && (difficulty.includes("5") || difficulty.length === 0)) {
          return true;
        }
      } else {
        score = score as ChunithmScoreProps;
        if (fullCombo.length > 0) { // 过滤 Full Combo
          const matchNoFc = fullCombo.includes("nofullcombo") && !score.full_combo;
          const matchFc = fullCombo.filter(v => v !== "nofullcombo").includes(score.full_combo);
          if (!matchNoFc && !matchFc) return false;
        }
        if (fullSync.length > 0) { // 过滤 Full Chain
          const matchNoChain = fullSync.includes("nofullchain") && !score.full_chain;
          const matchChain = fullSync.filter(v => v !== "nofullchain").includes(score.full_chain);
          if (!matchNoChain && !matchChain) return false;
        }
      }
      return difficulty.includes(score.level_index.toString()) || difficulty.length === 0 // 过滤难度
    })

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

        matchGenre = (genre.some((selected) =>
          songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre)) || genre.length === 0; // 过滤乐曲分类
        matchVersion = (version.some((selected) => difficulty.version >= selected && difficulty.version < (
          songList.versions[songList.versions.findIndex((value) => value.version === selected) + 1]?.version || selected + 1000)) || version.length === 0); // 过滤版本
        matchRating = ((difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]) || (
          rating.every((v, i)=> v === filterData[game].rating[i]) && score.type === "utage")); // 过滤定数
      } else {
        song = song as ChunithmSongProps;
        score = score as ChunithmScoreProps;

        const difficulty = songList.getDifficulty(song, score.level_index);
        if (!difficulty) return false;

        matchGenre = (genre.some((selected) =>
          songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre)) || genre.length === 0; // 过滤乐曲分类
        matchVersion  = (version.some((selected) => difficulty.version >= selected && difficulty.version < (
          songList.versions[songList.versions.findIndex((value) => value.version === selected) + 1]?.version || selected + 500)) || version.length === 0); // 过滤版本
        matchRating = ((difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]) || (
          rating.every((v, i)=> v === filterData[game].rating[i]) && score.level_index === 5)); // 过滤定数
      }

      return matchGenre && matchVersion && matchRating;
    })

    // 过滤上传时间
    const startTime = uploadTime[0] ? new Date(uploadTime[0]).getTime() : null;
    const endTime = uploadTime[1] ? new Date(uploadTime[1]).getTime() : null;

    filteredData = filteredData.filter(score => {
      const t = Date.parse(score.upload_time);
      if (startTime && t < startTime) return false;
      if (endTime && t >= endTime + 24 * 60 * 60 * 1000) return false;
      return true;
    });

    setFilteredScores(filteredData);
  }, [filters]);

  if (!songList) return null;

  return <>
    <Grid mb="xs">
      <Grid.Col span={6}>
        <Text fz="xs" c="dimmed" mb={3}>筛选难度</Text>
        <MultiSelect
          variant="filled"
          data={(filterData[game] || {}).difficulties}
          placeholder="请选择难度"
          value={difficulty}
          onChange={(value) => setFilter("difficulty", value)}
          comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
        />
      </Grid.Col>
      <Grid.Col span={6}>
        <Text fz="xs" c="dimmed" mb={3}>筛选乐曲分类</Text>
        <MultiSelect
          variant="filled"
          data={songList.genres.map((item) => ({
            value: item.genre,
            label: "title" in item ? item.title: item.genre,
          }))}
          placeholder="请选择乐曲分类"
          value={genre}
          onChange={(value) => setFilter("genre", value)}
          comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
        />
      </Grid.Col>
      <Grid.Col span={6}>
        <Text fz="xs" c="dimmed" mb={3}>筛选版本</Text>
        <MultiSelect
          variant="filled"
          data={songList.versions.map((item) => ({
            value: item.version.toString(),
            label: item.title,
          })).reverse()}
          placeholder="请选择版本"
          value={version.map((item) => item.toString())}
          onChange={(value) => setFilter("version", value.map((item) => parseInt(item)))}
          comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
        />
      </Grid.Col>
      <Grid.Col span={6}>
        <Text fz="xs" c="dimmed" mb={3}>筛选上传时间</Text>
        <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 0, weekendDays: [0, 6] }}>
          <DatePickerInput
            type="range"
            allowSingleDateInRange={true}
            excludeDate={(date) => new Date(date) > new Date()}
            variant="filled"
            size="sm"
            placeholder="请选择上传时间范围"
            labelSeparator=" ~ "
            valueFormat="YYYY/M/D"
            value={uploadTime}
            onChange={(value) => setFilter("uploadTime", value)}
            clearable
          />
        </DatesProvider>
      </Grid.Col>
      <Grid.Col span={12}>
        <Text fz="xs" c="dimmed" mb={3}>筛选谱面定数</Text>
        <Group gap="xs">
          <NumberInput
            variant="filled"
            w={60}
            size="xs"
            min={filterData[game].rating[0]}
            max={filterData[game].rating[1]}
            step={0.1}
            decimalScale={1}
            value={rating[0]}
            onChange={(value) => {
              if (value === "" || value === undefined) return;
              const numValue = typeof value === "string" ? parseFloat(value) : value;
              if (isNaN(numValue) || numValue > rating[1]) return;
              const rounded = Math.floor(numValue * 10) / 10;
              setFilter("rating", [rounded, rating[1]]);
              setFilter("endRating", [rounded, rating[1]]);
            }}
            stepHoldDelay={500}
            stepHoldInterval={100}
            fixedDecimalScale
          />
          {small ? "~" : (
            <RangeSlider
              style={{ flex: 1 }}
              min={filterData[game].rating[0]}
              max={filterData[game].rating[1]}
              step={0.1}
              minRange={0.1}
              precision={1}
              value={rating}
              marks={Array.from({ length: filterData[game].rating[1] }, (_, index) => ({
                value: index + 1,
                label: String(index + 1),
              }))}
              onChange={(value) => setFilter("rating", value as [number, number])}
              onChangeEnd={(value) => setFilter("endRating", value as [number, number])}
              mb={24}
            />
          )}
          <NumberInput
            variant="filled"
            w={60}
            size="xs"
            min={filterData[game].rating[0]}
            max={filterData[game].rating[1]}
            step={0.1}
            decimalScale={1}
            value={rating[1]}
            onChange={(value) => {
              if (value === "" || value === undefined) return;
              const numValue = typeof value === "string" ? parseFloat(value) : value;
              if (isNaN(numValue) || numValue < rating[0]) return;
              const rounded = Math.floor(numValue * 10) / 10;
              setFilter("rating", [rating[0], rounded]);
              setFilter("endRating", [rating[0], rounded]);
            }}
            stepHoldDelay={500}
            stepHoldInterval={100}
            fixedDecimalScale
          />
        </Group>
      </Grid.Col>
      {songList instanceof MaimaiSongList && (
        <>
          <Grid.Col span={12}>
            <FilterChips
              title="筛选 DX 星级"
              value={deluxeStar.map(String)}
              onChange={(val) => setFilter("deluxeStar", val.map(Number))}
              options={[
                { value: "0", label: "无" },
                ...[1, 2, 3, 4, 5].map((count) => {
                  const rate = count <= 2 ? 1 : count <= 4 ? 2 : 3;
                  return ({
                    value: count.toString(),
                    label: <>
                      <Image
                        src={`/assets/maimai/dx_score/${rate}.webp`}
                        h={16} w="auto" mr={4}
                        style={{ display: "inline", verticalAlign: "middle", position: "relative", top: "-0.1em" }}
                      />
                      <span>{count}</span>
                    </>,
                  });
                }),
              ]}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <FilterChips
              title="筛选全连击"
              value={fullCombo}
              onChange={(val) => setFilter("fullCombo", val)}
              options={[
                { value: "nofc", label: "无" },
                { value: "fc", label: "FC" },
                { value: "fcp", label: "FC+" },
                { value: "ap", label: "AP" },
                { value: "app", label: "AP+" },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <FilterChips
              title="筛选全同步"
              value={fullSync}
              onChange={(val) => setFilter("fullSync", val)}
              options={[
                { value: "nofs", label: "无" },
                { value: "sync", label: "SYNC" },
                { value: "fs", label: "FS" },
                { value: "fsp", label: "FS+" },
                { value: "fsd", label: "FDX" },
                { value: "fsdp", label: "FDX+" },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <FilterChips
              title="筛选谱面类型"
              value={type}
              onChange={(val) => setFilter("type", val)}
              options={[
                { value: "standard", label: "标准" },
                { value: "dx", label: "DX" },
              ]}
            />
          </Grid.Col>
        </>
      )}
      {songList instanceof ChunithmSongList && (
        <>
          <Grid.Col span={12}>
            <FilterChips
              title="筛选 FULL COMBO"
              value={fullCombo}
              onChange={(value) => setFilter("fullCombo", value)}
              options={[
                { value: "nofullcombo", label: "无" },
                { value: "fullcombo", label: "FC" },
                { value: "alljustice", label: "AJ" },
                { value: "alljusticecritical", label: "AJC" },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <FilterChips
              title="筛选 FULL CHAIN"
              value={fullSync}
              onChange={(value) => setFilter("fullSync", value)}
              options={[
                { value: "nofullchain", label: "无" },
                { value: "fullchain", label: "铂" },
                { value: "fullchain2", label: "金" },
              ]}
            />
          </Grid.Col>
        </>
      )}
    </Grid>
    <Space h="xs" />
    <Group justify="space-between">
      <Switch
        label="显示未游玩谱面"
        checked={showUnplayed}
        onChange={() => setFilter("showUnplayed", !showUnplayed)}
      />
      <Button leftSection={<IconReload size={20} />} variant="light" onClick={() => resetFilters()}>
        重置筛选条件
      </Button>
    </Group>
  </>
}
