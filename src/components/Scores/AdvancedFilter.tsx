import {
  Button,
  Grid,
  Group,
  Image,
  MultiSelect,
  NumberInput,
  RangeSlider,
  Select,
  Space,
  Switch,
  Text,
} from "@mantine/core";
import { IconReload } from "@tabler/icons-react";
import { FilterChips } from "@/components/FilterChips.tsx";
import { MaimaiSongList } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList } from "@/utils/api/song/chunithm.ts";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import "dayjs/locale/zh-cn";
import useSongListStore from "@/hooks/useSongListStore.ts";
import useGame from "@/hooks/useGame.ts";
import { ScoreFilters } from "@/hooks/useScoreFilters.ts";
import { scoreRatingRanges } from "@/hooks/useFilteredScores.ts";
import { match, P } from "ts-pattern";

const difficultyData = {
  maimai: [
    {
      value: "0",
      label: "🟢 BASIC",
    },
    {
      value: "1",
      label: "🟡 ADVANCED",
    },
    {
      value: "2",
      label: "🔴 EXPERT",
    },
    {
      value: "3",
      label: "🟣 MASTER",
    },
    {
      value: "4",
      label: "⚪ Re:MASTER",
    },
    {
      value: "5",
      label: "💮 U·TA·GE",
    },
  ],
  chunithm: [
    {
      value: "0",
      label: "🟢 BASIC",
    },
    {
      value: "1",
      label: "🟡 ADVANCED",
    },
    {
      value: "2",
      label: "🔴 EXPERT",
    },
    {
      value: "3",
      label: "🟣 MASTER",
    },
    {
      value: "4",
      label: "⚫ ULTIMA",
    },
    {
      value: "5",
      label: "🌈 WORLD'S END",
    },
  ],
};

type RatingPreset = {
  value: string;
  label: string;
  range: [number, number];
};

const maimaiRatingPresets: RatingPreset[] = [
  { value: "all", label: "全部", range: [1, 15] },
  { value: "1", label: "1", range: [1.0, 1.9] },
  { value: "2", label: "2", range: [2.0, 2.9] },
  { value: "3", label: "3", range: [3.0, 3.9] },
  { value: "4", label: "4", range: [4.0, 4.9] },
  { value: "5", label: "5", range: [5.0, 5.9] },
  { value: "6", label: "6", range: [6.0, 6.9] },
  { value: "7", label: "7", range: [7.0, 7.5] },
  { value: "7+", label: "7+", range: [7.6, 7.9] },
  { value: "8", label: "8", range: [8.0, 8.5] },
  { value: "8+", label: "8+", range: [8.6, 8.9] },
  { value: "9", label: "9", range: [9.0, 9.5] },
  { value: "9+", label: "9+", range: [9.6, 9.9] },
  { value: "10", label: "10", range: [10.0, 10.5] },
  { value: "10+", label: "10+", range: [10.6, 10.9] },
  { value: "11", label: "11", range: [11.0, 11.5] },
  { value: "11+", label: "11+", range: [11.6, 11.9] },
  { value: "12", label: "12", range: [12.0, 12.5] },
  { value: "12+", label: "12+", range: [12.6, 12.9] },
  { value: "13", label: "13", range: [13.0, 13.5] },
  { value: "13+", label: "13+", range: [13.6, 13.9] },
  { value: "14", label: "14", range: [14.0, 14.5] },
  { value: "14+", label: "14+", range: [14.6, 14.9] },
  { value: "15", label: "15", range: [15.0, 15.0] },
];

const chunithmRatingPresets: RatingPreset[] = [
  { value: "all", label: "全部", range: [1, 16] },
  { value: "1", label: "1", range: [1.0, 1.9] },
  { value: "2", label: "2", range: [2.0, 2.9] },
  { value: "3", label: "3", range: [3.0, 3.9] },
  { value: "4", label: "4", range: [4.0, 4.9] },
  { value: "5", label: "5", range: [5.0, 5.9] },
  { value: "6", label: "6", range: [6.0, 6.9] },
  { value: "7", label: "7", range: [7.0, 7.4] },
  { value: "7+", label: "7+", range: [7.5, 7.9] },
  { value: "8", label: "8", range: [8.0, 8.4] },
  { value: "8+", label: "8+", range: [8.5, 8.9] },
  { value: "9", label: "9", range: [9.0, 9.4] },
  { value: "9+", label: "9+", range: [9.5, 9.9] },
  { value: "10", label: "10", range: [10.0, 10.4] },
  { value: "10+", label: "10+", range: [10.5, 10.9] },
  { value: "11", label: "11", range: [11.0, 11.4] },
  { value: "11+", label: "11+", range: [11.5, 11.9] },
  { value: "12", label: "12", range: [12.0, 12.4] },
  { value: "12+", label: "12+", range: [12.5, 12.9] },
  { value: "13", label: "13", range: [13.0, 13.4] },
  { value: "13+", label: "13+", range: [13.5, 13.9] },
  { value: "14", label: "14", range: [14.0, 14.4] },
  { value: "14+", label: "14+", range: [14.5, 14.9] },
  { value: "15", label: "15", range: [15.0, 15.4] },
  { value: "15+", label: "15+", range: [15.5, 16.0] },
];

const ratingPresets = {
  maimai: maimaiRatingPresets,
  chunithm: chunithmRatingPresets,
};

function findRatingPreset(presets: RatingPreset[], value: [number, number]) {
  return (
    presets.find((preset) => preset.range[0] === value[0] && preset.range[1] === value[1])?.value ??
    null
  );
}

interface AdvancedFilterProps {
  filters: ScoreFilters;
  setFilter: <K extends keyof ScoreFilters>(key: K, value: ScoreFilters[K]) => void;
  resetFilters: () => void;
}

export const AdvancedFilter = ({ filters, setFilter, resetFilters }: AdvancedFilterProps) => {
  const [game] = useGame();

  const {
    difficulty,
    type,
    genre,
    version,
    rating,
    endRating,
    fullCombo,
    fullSync,
    deluxeStar,
    uploadTime,
    showUnplayed,
  } = filters;

  const getSongList = useSongListStore((state) => state.getSongList);
  const songList = getSongList(game);
  const ratingRange = scoreRatingRanges[game];
  const currentRatingPresets = ratingPresets[game];
  const selectedRatingPreset = findRatingPreset(currentRatingPresets, endRating);

  // 稀疏刻度：隔 2 标注一个，避免窄容器（侧栏/抽屉/移动端）下刻度重叠
  const sliderMarks: { value: number; label: string }[] = [];
  for (let value = ratingRange[0]; value <= ratingRange[1]; value += 2) {
    sliderMarks.push({ value, label: String(value) });
  }
  if (sliderMarks[sliderMarks.length - 1].value !== ratingRange[1]) {
    sliderMarks.push({ value: ratingRange[1], label: String(ratingRange[1]) });
  }

  if (!songList) return null;

  return (
    <>
      <Grid mb="xs">
        <Grid.Col span={6}>
          <Text fz="xs" c="dimmed" mb={3}>
            筛选难度
          </Text>
          <MultiSelect
            variant="filled"
            data={difficultyData[game]}
            placeholder="请选择难度"
            value={difficulty}
            onChange={(value) => setFilter("difficulty", value)}
            comboboxProps={{
              transitionProps: { transition: "fade", duration: 100, timingFunction: "ease" },
            }}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Text fz="xs" c="dimmed" mb={3}>
            筛选乐曲分类
          </Text>
          <MultiSelect
            variant="filled"
            data={songList.genres.map((item) => ({
              value: item.genre,
              label: "title" in item ? item.title : item.genre,
            }))}
            placeholder="请选择乐曲分类"
            value={genre}
            onChange={(value) => setFilter("genre", value)}
            comboboxProps={{
              transitionProps: { transition: "fade", duration: 100, timingFunction: "ease" },
            }}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Text fz="xs" c="dimmed" mb={3}>
            筛选版本
          </Text>
          <MultiSelect
            variant="filled"
            data={songList.versions
              .map((item) => ({
                value: item.version.toString(),
                label: item.title,
              }))
              .reverse()}
            placeholder="请选择版本"
            value={version.map((item) => item.toString())}
            onChange={(value) =>
              setFilter(
                "version",
                value.map((item) => parseInt(item)),
              )
            }
            comboboxProps={{
              transitionProps: { transition: "fade", duration: 100, timingFunction: "ease" },
            }}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Text fz="xs" c="dimmed" mb={3}>
            筛选上传时间
          </Text>
          <DatesProvider settings={{ locale: "zh-cn", firstDayOfWeek: 0, weekendDays: [0, 6] }}>
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
          <Text fz="xs" c="dimmed" mb={3}>
            筛选谱面定数
          </Text>
          <Group gap="xs">
            <NumberInput
              aria-label="最低谱面定数"
              variant="filled"
              w={75}
              size="xs"
              min={ratingRange[0]}
              max={ratingRange[1]}
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
            ~
            <NumberInput
              aria-label="最高谱面定数"
              variant="filled"
              w={75}
              size="xs"
              min={ratingRange[0]}
              max={ratingRange[1]}
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
            <Select
              aria-label="谱面定数快捷范围"
              variant="filled"
              size="xs"
              style={{ flex: 1 }}
              maw={75}
              data={currentRatingPresets.map(({ value, label }) => ({ value, label }))}
              placeholder={selectedRatingPreset ? "快捷等级" : "自定义"}
              value={selectedRatingPreset}
              onChange={(value) => {
                const preset = currentRatingPresets.find((item) => item.value === value);
                if (!preset) return;
                setFilter("rating", preset.range);
                setFilter("endRating", preset.range);
              }}
              allowDeselect={false}
            />
          </Group>
          <RangeSlider
            thumbFromLabel="最低谱面定数"
            thumbToLabel="最高谱面定数"
            thumbValueText={(value) => value.toFixed(1)}
            mt="xs"
            mb={24}
            min={ratingRange[0]}
            max={ratingRange[1]}
            step={0.1}
            minRange={0}
            precision={1}
            value={rating}
            marks={sliderMarks}
            onChange={(value) => setFilter("rating", value as [number, number])}
            onChangeEnd={(value) => setFilter("endRating", value as [number, number])}
          />
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
                    const rate = match(count)
                      .with(P.number.lte(2), () => 1)
                      .with(P.number.lte(4), () => 2)
                      .otherwise(() => 3);
                    return {
                      value: count.toString(),
                      label: (
                        <>
                          <Image
                            src={`/assets/maimai/dx_score/${rate}.webp`}
                            h={16}
                            w="auto"
                            alt=""
                            loading="lazy"
                            mr={4}
                            style={{
                              display: "inline",
                              verticalAlign: "middle",
                              position: "relative",
                              top: "-0.1em",
                            }}
                          />
                          <span>{count}</span>
                        </>
                      ),
                    };
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
        <Button
          leftSection={<IconReload size={20} />}
          variant="light"
          onClick={() => resetFilters()}
        >
          重置筛选条件
        </Button>
      </Group>
    </>
  );
};
