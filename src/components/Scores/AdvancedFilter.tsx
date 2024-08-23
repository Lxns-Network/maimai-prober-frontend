import { MaimaiScoreProps } from "./maimai/Score.tsx";
import { ChunithmScoreProps } from "./chunithm/Score.tsx";
import {
  Button,
  Chip, Flex,
  Grid,
  Group,
  MultiSelect, NumberInput,
  RangeSlider,
  Space, Switch,
  Text
} from "@mantine/core";
import { IconReload } from "@tabler/icons-react";
import { MaimaiDifficultiesProps, MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import "dayjs/locale/zh-cn";
import useSongListStore from "../../hooks/useSongListStore.tsx";

interface AdvancedFilterProps {
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
  onChange: (filteredScores: (MaimaiScoreProps | ChunithmScoreProps)[]) => void;
}

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

export const AdvancedFilter = ({ scores, onChange }: AdvancedFilterProps) => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [filteredScores, setFilteredScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);

  const [difficulty, setDifficulty] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [rating, setRating] = useState<[number, number]>([0, 0]);
  const [endRating, setEndRating] = useState<[number, number]>([0, 0]);
  const [genre, setGenre] = useState<string[]>([]);
  const [version, setVersion] = useState<number[]>([]);
  const [fullCombo, setFullCombo] = useState<string[]>([]);
  const [fullSync, setFullSync] = useState<string[]>([]);
  const [showUnplayed, { toggle: toggleShowUnplayed }] = useDisclosure(false);
  const [uploadTime, setUploadTime] = useState<[Date | null, Date | null]>([null, null]);

  const getSongList = useSongListStore((state) => state.getSongList);
  const small = useMediaQuery('(max-width: 30rem)');

  const resetFilter = (game?: "maimai" | "chunithm") => {
    if (!game) return;

    setRating(filterData[game].rating);
    setDifficulty([]);
    setGenre([]);
    setVersion([]);
    setFullCombo([]);
    setFullSync([]);
    setType([]);
    setUploadTime([null, null]);
  }

  useEffect(() => {
    setSongList(getSongList(game));
    resetFilter(game);
  }, [game]);

  useEffect(() => {
    onChange(filteredScores);
  }, [filteredScores]);

  useEffect(() => {
    if (!scores || !game) return;

    let filteredData = [...scores];

    if (showUnplayed) {
      if (songList instanceof MaimaiSongList) {
        const scoreKeys = new Set(
          filteredData.map((item) => `${item.id}-${(item as MaimaiScoreProps).type}-${item.level_index}`));

        songList.songs.forEach((song) => {
          ["dx", "standard", "utage"].forEach((type) => {
            const difficulties = song.difficulties[type as keyof MaimaiDifficultiesProps];
            if (!difficulties) return;

            difficulties.forEach((difficulty) => {
              if (!scoreKeys.has(`${song.id}-${type}-${difficulty.difficulty}`)) filteredData.push({
                id: song.id,
                song_name: song.title,
                level: difficulty.level,
                level_index: difficulty.difficulty,
                achievements: -1,
                fc: "",
                fs: "",
                dx_score: -1,
                dx_rating: -1,
                rate: "",
                type: type,
                upload_time: ""
              });
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
              clear: "",
              full_combo: "",
              full_chain: "",
              over_power: 0,
              rank: "",
              rating: 0,
              upload_time: ""
            });
          });
        });
      }
    }

    // 如果没有任何筛选条件，直接返回
    if (difficulty.length + type.length + fullCombo.length + fullSync.length + genre.length + version.length === 0 &&
      rating.every((v, i)=> v === filterData[game].rating[i]) && uploadTime.every((v) => v === null)) {
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
        if (fullCombo.includes("nofc")) { // 过滤 Full Combo
          if (score.fc) return false;
        } else if (fullCombo.length > 0 && !fullCombo.includes(score.fc)) {
          return false;
        }
        if (fullSync.includes("nofs")) { // 过滤 Full Sync
          if (score.fs) return false;
        } else if (fullSync.length > 0 && !fullSync.includes(score.fs)) {
          return false;
        }
        // 宴谱的 level_index 基本都是 0，需要提前过滤
        if (score.type === "utage" && (difficulty.includes("5") || difficulty.length === 0)) {
          return true;
        }
      } else {
        score = score as ChunithmScoreProps;
        if (fullCombo.includes("nofullcombo")) { // 过滤 Full Combo
          if (score.full_combo) return false;
        } else if (fullCombo.length > 0 && !fullCombo.includes(score.full_combo)) {
          return false;
        }
        if (fullSync.includes("nofullchain")) { // 过滤 Full Chain
          if (score.full_chain) return false;
        } else if (fullSync.length > 0 && !fullSync.includes(score.full_chain)) {
          if (fullSync.includes("ajc") && score.score !== 1010000) {
            return false;
          } else if (!fullSync.includes("ajc")) return false;
        }
      }
      return difficulty.includes(score.level_index.toString()) || difficulty.length === 0 // 过滤难度
    })

    filteredData = filteredData.filter((score) => {
      if (!songList) return false;
      let song = songList.find(score.id);
      if (!song) return false;

      if (songList instanceof MaimaiSongList) {
        song = song as MaimaiSongProps;
        score = score as MaimaiScoreProps;

        const difficulty = songList.getDifficulty(song, score.type, score.level_index);
        if (!difficulty) return false;

        return ((genre.some((selected) =>
            songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre)) || genre.length === 0) // 过滤乐曲分类
          && (version.some((selected) => difficulty.version >= selected && difficulty.version < (
            songList.versions[songList.versions.findIndex((value) => value.version === selected) + 1]?.version || selected + 1000)) || version.length === 0) // 过滤版本
          && ((difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]) || (
            rating.every((v, i)=> v === filterData[game].rating[i]) && score.type === "utage")); // 过滤定数
      } else {
        song = song as ChunithmSongProps;
        score = score as ChunithmScoreProps;

        const difficulty = songList.getDifficulty(song, score.level_index);
        if (!difficulty) return false;

        return ((genre.some((selected) =>
            songList.genres.find((genre) => genre.genre === selected)?.genre === song?.genre)) || genre.length === 0) // 过滤乐曲分类
          && (version.some((selected) => difficulty.version >= selected && difficulty.version < (
            songList.versions[songList.versions.findIndex((value) => value.version === selected) + 1]?.version || selected + 500)) || version.length === 0) // 过滤版本
          && ((difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]) || (
            rating.every((v, i)=> v === filterData[game].rating[i]) && score.level_index === 5)); // 过滤定数
      }
    })

    if (uploadTime[0] !== null) {
      filteredData = filteredData.filter((score) => {
        return new Date(score.upload_time) >= uploadTime[0]!;
      });
    }
    if (uploadTime[1] !== null) {
      const endDate = new Date(uploadTime[1]!);
      endDate.setDate(endDate.getDate() + 1);

      filteredData = filteredData.filter((score) => {
        return new Date(score.upload_time) < endDate;
      });
    }

    setFilteredScores(filteredData);
  }, [showUnplayed, difficulty, type, genre, version, endRating, fullCombo, fullSync, uploadTime]);

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
          onChange={(value) => setDifficulty(value)}
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
          onChange={(value) => setGenre(value)}
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
          onChange={(value) => setVersion(value.map((item) => parseInt(item)))}
          comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
        />
      </Grid.Col>
      <Grid.Col span={6}>
        <Text fz="xs" c="dimmed" mb={3}>筛选上传时间</Text>
        <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 0, weekendDays: [0, 6], timezone: 'Asia/Shanghai' }}>
          <DatePickerInput
            type="range"
            allowSingleDateInRange={true}
            excludeDate={(date) => date > new Date()}
            variant="filled"
            placeholder="请选择上传时间范围"
            labelSeparator=" ~ "
            valueFormat="YYYY/M/D"
            value={uploadTime}
            onChange={setUploadTime}
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
            min={game && filterData[game].rating[0]}
            max={game && filterData[game].rating[1]}
            step={0.1}
            decimalScale={1}
            value={rating[0]}
            onChange={(value) => {
              if (typeof value !== "number" || isNaN(value)) return;
              if (value > rating[1]) return;
              value = Math.floor(value * 10) / 10;
              setRating([value, rating[1]])
              setEndRating([value, rating[1]])
            }}
            stepHoldDelay={500}
            stepHoldInterval={100}
            fixedDecimalScale
          />
          {small ? "~" : (
            <RangeSlider
              style={{ flex: 1 }}
              min={game && filterData[game].rating[0]}
              max={game && filterData[game].rating[1]}
              step={0.1}
              minRange={0.1}
              precision={1}
              value={rating}
              marks={Array.from({ length: game ? filterData[game].rating[1] : 0 }, (_, index) => ({
                value: index + 1,
                label: String(index + 1),
              }))}
              onChange={setRating}
              onChangeEnd={setEndRating}
              mb={24}
            />
          )}
          <NumberInput
            variant="filled"
            w={60}
            size="xs"
            min={game && filterData[game].rating[0]}
            max={game && filterData[game].rating[1]}
            step={0.1}
            decimalScale={1}
            value={rating[1]}
            onChange={(value) => {
              if (typeof value !== "number" || isNaN(value)) return;
              if (value < rating[0]) return;
              setRating([rating[0], value])
              setEndRating([rating[0], value])
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
            <Text fz="xs" c="dimmed" mb={3}>筛选 FULL COMBO</Text>
            <Flex rowGap="xs" columnGap="md" wrap="wrap">
              <Chip.Group multiple value={fullCombo} onChange={setFullCombo}>
                <Chip variant="filled" size="xs" value="nofc">无</Chip>
                <Chip variant="filled" size="xs" value="fc">FC</Chip>
                <Chip variant="filled" size="xs" value="fcp">FC+</Chip>
                <Chip variant="filled" size="xs" value="ap">AP</Chip>
                <Chip variant="filled" size="xs" value="app">AP+</Chip>
              </Chip.Group>
            </Flex>
          </Grid.Col>
          <Grid.Col span={12}>
            <Text fz="xs" c="dimmed" mb={3}>筛选 FULL SYNC</Text>
            <Flex rowGap="xs" columnGap="md" wrap="wrap">
              <Chip.Group multiple value={fullSync} onChange={setFullSync}>
                <Chip variant="filled" size="xs" value="nofs">无</Chip>
                <Chip variant="filled" size="xs" value="sync">SYNC</Chip>
                <Chip variant="filled" size="xs" value="fs">FS</Chip>
                <Chip variant="filled" size="xs" value="fsp">FS+</Chip>
                <Chip variant="filled" size="xs" value="fsd">FDX</Chip>
                <Chip variant="filled" size="xs" value="fsdp">FDX+</Chip>
              </Chip.Group>
            </Flex>
          </Grid.Col>
          <Grid.Col span={6}>
            <Text fz="xs" c="dimmed" mb={3}>筛选谱面类型</Text>
            <Flex rowGap="xs" columnGap="md" wrap="wrap">
              <Chip.Group multiple value={type} onChange={setType}>
                <Chip variant="filled" size="xs" value="standard" color="blue">标准</Chip>
                <Chip variant="filled" size="xs" value="dx" color="orange">DX</Chip>
              </Chip.Group>
            </Flex>
          </Grid.Col>
        </>
      )}
      {songList instanceof ChunithmSongList && (
        <>
          <Grid.Col span={12}>
            <Text fz="xs" c="dimmed" mb={3}>筛选 FULL COMBO</Text>
            <Flex rowGap="xs" columnGap="md" wrap="wrap">
              <Chip.Group multiple value={fullCombo} onChange={setFullCombo}>
                <Chip variant="filled" size="xs" value="nofullcombo">无</Chip>
                <Chip variant="filled" size="xs" value="fullcombo">FC</Chip>
                <Chip variant="filled" size="xs" value="alljustice">AJ</Chip>
                <Chip variant="filled" size="xs" value="ajc">AJC</Chip>
              </Chip.Group>
            </Flex>
          </Grid.Col>
          <Grid.Col span={12}>
            <Text fz="xs" c="dimmed" mb={3}>筛选 FULL CHAIN</Text>
            <Flex rowGap="xs" columnGap="md" wrap="wrap">
              <Chip.Group multiple value={fullSync} onChange={setFullSync}>
                <Chip variant="filled" size="xs" value="nofullchain">无</Chip>
                <Chip variant="filled" size="xs" value="fullchain">铂</Chip>
                <Chip variant="filled" size="xs" value="fullchain2">金</Chip>
              </Chip.Group>
            </Flex>
          </Grid.Col>
        </>
      )}
    </Grid>
    <Space h="xs" />
    <Group justify="space-between">
      <Switch
        label="显示未游玩谱面"
        defaultChecked={showUnplayed}
        onChange={toggleShowUnplayed}
      />
      <Button leftSection={<IconReload size={20} />} variant="light" onClick={() => resetFilter(game)}>
        重置筛选条件
      </Button>
    </Group>
  </>
}