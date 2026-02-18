import {
  Avatar, Button, Chip, Divider, Flex, Grid, Group, Input, NumberInput, Select, Text
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TransformedValues, useForm } from "@mantine/form";
import { useComputedColorScheme } from "@mantine/core";
import { ChunithmDifficultyProps, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { DatesProvider, DateTimePicker } from "@mantine/dates";
import { createPlayerScores } from "@/utils/api/player.ts";
import { SongCombobox } from "../../SongCombobox.tsx";
import "dayjs/locale/zh-cn"
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "@/main";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps } from "@/types/score";

interface FormValues {
  id: number | null;
  difficulty?: string | null;
  level_index: number | null;
  score: number | null;
  clear: string | null;
  full_combo: string | null;
  full_chain: string | null;
  play_time: string | null;
}

interface CreateScoreModalProps {
  score?: ChunithmScoreProps | null;
  onSubmit?: (values: FormValues) => void;
  onClose: () => void;
}

export const ChunithmCreateScoreModalContent = ({ score, onSubmit, onClose }: CreateScoreModalProps) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.chunithm })),
  )
  const [uploading, setUploading] = useState(false);
  const [song, setSong] = useState<ChunithmSongProps | null>(null);
  const [difficulties, setDifficulties] = useState<ChunithmDifficultyProps[] | null>(null);
  const computedColorScheme = useComputedColorScheme('light');

  const form = useForm<FormValues>({
    initialValues: {
      id: score ? score.id : null,
      difficulty: score ? score.level_index.toString() : null,
      level_index: score ? score.level_index : null,
      score: null,
      clear: null,
      full_combo: null,
      full_chain: null,
      play_time: null,
    },

    validate: {
      id: (value) => value !== null && value !== 0 ? null : "请选择曲目",
      difficulty: (value) => value !== null ? null : "请选择难度",
      score: (value) => value !== null ? null : "请输入分数",
      clear: (value) => value !== null ? null : "请选择 Clear 类型",
      full_combo: (value) => value !== null ? null : "请选择 Full Combo",
      full_chain: (value) => value !== null ? null : "请选择 Full Chain",
      play_time: (value) => !value || new Date(value) <= new Date() ? null : "请选择正确的游玩时间",
    },

    transformValues: (values) => ({
      id: values.id,
      level_index: parseInt(values.difficulty as string),
      score: values.score,
      clear: values.clear,
      full_combo: values.full_combo !== "nofullcombo" ? values.full_combo : null,
      full_chain: values.full_chain !== "nofullchain" ? values.full_chain : null,
      play_time: values.play_time ? (new Date(values.play_time)).toISOString().split('.')[0]+"Z" : null,
    }),
  });

  const createScoreHandler = async (values: TransformedValues<typeof form>) => {
    setUploading(true);

    try {
      const res = await createPlayerScores("chunithm", [values]);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("成绩创建成功", "你的成绩已经成功创建。");
      form.setValues({
        id: null,
        difficulty: null,
        score: null,
        clear: null,
        full_combo: null,
        full_chain: null,
        play_time: null,
      });
      onSubmit?.(values);
    } catch (error) {
      openRetryModal("成绩创建失败", `${error}`, () => createScoreHandler(values));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    form.setValues({
      id: score ? score.id : 0,
      difficulty: null,
    });
  }, [score]);

  useEffect(() => {
    setDifficulties(null);

    if (!form.values.id) return;

    const song = songList.find(form.values.id);
    song && setSong(song);
  }, [form.values.id]);

  useEffect(() => {
    if (!song) return;

    setDifficulties(song.difficulties);

    form.setValues({
      difficulty: score ? score.level_index.toString() : null,
    });
  }, [song]);

  return (
    <form onSubmit={form.onSubmit((values) => {
      openConfirmModal("确认创建成绩", "你确定要创建成绩吗？我们不推荐手动维护成绩，这可能会导致未来 Rating 与游戏内显示不一致。", () => createScoreHandler(values));
    })}>
      <Flex align="center" gap="md">
        <SongDisabledIndicator disabled={song?.disabled}>
          <Avatar size={94} radius="md" src={
            song ? `${ASSET_URL}/chunithm/jacket/${songList.getSongResourceId(song.id)}.png!webp` : null
          } styles={(theme) => ({
            root: {
              backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
            }
          })}>
            <Text ta="center" fz="xs">请选择曲目</Text>
          </Avatar>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          <SongCombobox
            value={form.values.id || 0}
            onOptionSubmit={(value) => {
              form.setValues({ id: value });
            }}
            label="曲目"
            mb="sm"
            withAsterisk
            error={form.errors.id}
          />
          <Select
            label="难度"
            placeholder="请选择难度"
            mb="sm"
            withAsterisk
            data={difficulties ? difficulties.map((difficulty) => ({
              label: `${["🟢 BASIC", "🟡 ADVANCED", "🔴 EXPERT", "🟣 MASTER", "⚫ ULTIMA", "🌈 WORLD'S END"][difficulty.difficulty]} ${
                difficulty.difficulty === 5 ? difficulty.kanji : difficulty.level}`,
              value: difficulty.difficulty.toString(),
            })) : []}
            disabled={!difficulties || difficulties.length === 0}
            comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
            {...form.getInputProps("difficulty")}
          />
        </div>
      </Flex>
      <Grid mb="xs">
        <Grid.Col span={6}>
          <NumberInput
            label="分数"
            placeholder="请输入分数"
            min={0}
            max={1010000}
            allowDecimal={false}
            withAsterisk
            {...form.getInputProps("score")}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <Select
            label="Clear"
            placeholder="请选择 Clear 类型"
            data={[{
              label: "FAILED",
              value: "failed",
            }, {
              label: "CLEAR",
              value: "clear",
            }, {
              label: "HARD",
              value: "hard",
            }, {
              label: "BRAVE",
              value: "brave",
            }, {
              label: "ABSOLUTE",
              value: "absolute",
            }, {
              label: "CATASTROPHY",
              value: "catastrophy",
            }]}
            comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
            withAsterisk
            {...form.getInputProps("clear")}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Input.Wrapper label="Full Combo" withAsterisk {...form.getInputProps("full_combo")}>
            <Chip.Group onChange={(value) => form.setValues({ full_combo: value as string })}>
              <Flex wrap="wrap" columnGap="md" rowGap="xs">
                <Chip size="xs" value="nofullcombo">无</Chip>
                <Chip size="xs" value="fullcombo">FC</Chip>
                <Chip size="xs" value="alljustice">AJ</Chip>
                <Chip size="xs" value="alljusticecritical">AJC</Chip>
              </Flex>
            </Chip.Group>
          </Input.Wrapper>
        </Grid.Col>
        <Grid.Col span={12}>
          <Input.Wrapper label="Full Chain" mb="md" withAsterisk {...form.getInputProps("full_chain")}>
            <Chip.Group onChange={(value) => form.setValues({ full_chain: value as string })}>
              <Flex wrap="wrap" columnGap="md" rowGap="xs">
                <Chip size="xs" value="nofullchain">无</Chip>
                <Chip size="xs" value="fullchain">铂</Chip>
                <Chip size="xs" value="fullchain2">金</Chip>
              </Flex>
            </Chip.Group>
          </Input.Wrapper>
        </Grid.Col>
      </Grid>
      <Divider my="xs" label="以下为选填参数" labelPosition="center" />
      <Grid mb="xs">
        <Grid.Col span={12}>
          <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 0, weekendDays: [0, 6] }}>
            <DateTimePicker
              label="游玩时间"
              placeholder="请选择游玩时间"
              valueFormat="YYYY-MM-DD HH:mm:ss"
              excludeDate={(date) => new Date(date) > new Date()}
              size="sm"
              clearable
              {...form.getInputProps("play_time")}
            />
          </DatesProvider>
        </Grid.Col>
      </Grid>
      <Text size="xs" mb="sm" c="gray">成绩保存后，你的玩家 Rating 将会自动更新。</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onClose()}>取消</Button>
        <Button type="submit" loading={uploading} disabled={song?.disabled}>保存</Button>
      </Group>
    </form>
  );
}
