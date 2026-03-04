import {
  Avatar, Button, Chip, Divider, Flex, Grid, Group, Input, NumberInput, Select, Text
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TransformedValues, useForm } from "@mantine/form";
import { useComputedColorScheme } from "@mantine/core";
import { MaimaiDifficultyProps, MaimaiDifficultiesProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { DatesProvider, DateTimePicker } from "@mantine/dates";
import { useCreatePlayerScores } from "@/hooks/mutations/usePlayerMutations.ts";
import { SongCombobox } from "../../SongCombobox.tsx";
import "dayjs/locale/zh-cn"
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "@/main";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { MaimaiScoreProps } from "@/types/score";

interface FormValues {
  id: number | null;
  type: string | null;
  difficulty?: string | null;
  achievements: number | null;
  fc: string | null;
  fs: string | null;
  dx_score: number | null;
  play_time: string | null;
}

interface CreateScoreModalProps {
  score: MaimaiScoreProps | null;
  onSubmit?: (values: FormValues) => void;
  onClose: () => void;
}

export const MaimaiCreateScoreContent = ({ score, onSubmit, onClose }: CreateScoreModalProps) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.maimai })),
  )
  const { mutate: mutateCreateScores } = useCreatePlayerScores();
  const [uploading, setUploading] = useState(false);
  const [song, setSong] = useState<MaimaiSongProps | null>(null);
  const [difficulties, setDifficulties] = useState<MaimaiDifficultyProps[] | null>(null);

  const computedColorScheme = useComputedColorScheme('light');
  const form = useForm<FormValues>({
    initialValues: {
      id: score ? score.id : null,
      type: score ? score.type : null,
      difficulty: score ? score.level_index.toString() : null,
      achievements: null,
      fc: null,
      fs: null,
      dx_score: null,
      play_time: null,
    },

    validate: {
      id: (value) => value !== null && value !== 0 ? null : "请选择曲目",
      type: (value) => value !== null ? null : "请选择谱面类型",
      difficulty: (value) => value !== null ? null : "请选择难度",
      achievements: (value) => value !== null ? null : "请输入达成率",
      fc: (value) => value !== null ? null : "请选择 Full Combo",
      fs: (value) => value !== null ? null : "请选择 Full Sync",
      play_time: (value) => !value || new Date(value) <= new Date() ? null : "请选择正确的游玩时间",
    },

    transformValues: (values) => ({
      id: values.id,
      type: values.type,
      level_index: parseInt(values.difficulty as string),
      achievements: values.achievements,
      fc: values.fc !== "nofc" ? values.fc : null,
      fs: values.fs !== "nofs" ? values.fs : null,
      dx_score: values.dx_score || 0,
      play_time: values.play_time ? (new Date(values.play_time)).toISOString().split('.')[0]+"Z" : null,
    })
  });

  const createScoreHandler = (values: TransformedValues<typeof form>) => {
    setUploading(true);
    mutateCreateScores({ game: "maimai", scores: [values] }, {
      onSuccess: () => {
        openAlertModal("成绩创建成功", "你的成绩已经成功创建。")
        form.setValues({
          id: null,
          type: null,
          difficulty: null,
          achievements: null,
          fc: null,
          fs: null,
          dx_score: null,
          play_time: null,
        });
        onSubmit?.(values);
      },
      onError: (error) => {
        openRetryModal("成绩创建失败", `${error}`, () => createScoreHandler(values));
      },
      onSettled: () => {
        setUploading(false);
      },
    });
  }

  useEffect(() => {
    if (score) {
      form.setValues({
        id: score.id,
        type: null,
        difficulty: null,
      })
    } else {
      setSong(null);
      form.reset();
    }
  }, [score]);

  useEffect(() => {
    setDifficulties(null);

    if (!form.values.id) return;

    const song = songList.find(form.values.id);
    song && setSong(song);

    form.setValues({
      type: score ? score.type : null,
      difficulty: null,
    });
  }, [form.values.id]);

  useEffect(() => {
    if (!song || !form.values.type) return;

    setDifficulties(song.difficulties[form.values.type as keyof MaimaiDifficultiesProps]);

    form.setValues({
      difficulty: score ? score.level_index.toString() : null,
    });
  }, [song, form.values.type]);

  return (
    <form onSubmit={form.onSubmit((values) => {
      openConfirmModal("确认创建成绩", "你确定要创建成绩吗？我们不推荐手动维护成绩，这可能会导致未来 DX Rating 与游戏内显示不一致。", () => createScoreHandler(values));
    })}>
      <Flex align="center" gap="md">
        <SongDisabledIndicator disabled={song?.disabled}>
          <Avatar size={94} radius="md" src={
            song ? `${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png!webp` : null
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
          <Input.Wrapper label="谱面类型" mb="xs" withAsterisk {...form.getInputProps("type")}>
            <Chip.Group {...form.getInputProps("type")}>
              <Group>
                <Chip size="xs" value="standard" disabled={!song || song.difficulties.standard.length === 0}>标准</Chip>
                <Chip size="xs" value="dx" color="orange" disabled={!song || song.difficulties.dx.length === 0}>DX</Chip>
                {song && song.id >= 100000 && (
                  <Chip size="xs" value="utage" color="rgb(234,61,232)">U·TA·GE</Chip>
                )}
              </Group>
            </Chip.Group>
          </Input.Wrapper>
        </div>
      </Flex>
      <Grid mb="xs">
        <Grid.Col span={6}>
          <Select
            label="难度"
            placeholder="请选择难度"
            withAsterisk
            data={difficulties ? difficulties.map((difficulty) => ({
              label: `${["🟢 BASIC", "🟡 ADVANCED", "🔴 EXPERT", "🟣 MASTER", "⚪ Re:MASTER", "💮 U·TA·GE"][
                (song && song.id >= 100000) ? 5 : difficulty.difficulty]} ${difficulty.level}`,
              value: difficulty.difficulty.toString(),
            })) : []}
            disabled={!difficulties || difficulties.length === 0}
            comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
            {...form.getInputProps("difficulty")}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <NumberInput
            label="达成率"
            placeholder="请输入达成率"
            decimalScale={4}
            suffix="%"
            min={0}
            max={(difficulties && difficulties[0].is_buddy) ? 202 : 101}
            withAsterisk
            {...form.getInputProps("achievements")}
          />
        </Grid.Col>
      </Grid>
      <Input.Wrapper label="全连击" mb="xs" withAsterisk {...form.getInputProps("fc")}>
        <Chip.Group onChange={(value) => form.setValues({ fc: value as string })}>
          <Flex wrap="wrap" columnGap="md" rowGap="xs">
            <Chip size="xs" value="nofc">无</Chip>
            <Chip size="xs" value="fc">FC</Chip>
            <Chip size="xs" value="fcp">FC+</Chip>
            <Chip size="xs" value="ap">AP</Chip>
            <Chip size="xs" value="app">AP+</Chip>
          </Flex>
        </Chip.Group>
      </Input.Wrapper>
      <Input.Wrapper label="全同步" mb="md" withAsterisk {...form.getInputProps("fs")}>
        <Chip.Group onChange={(value) => form.setValues({ fs: value as string })}>
          <Flex wrap="wrap" columnGap="md" rowGap="xs">
            <Chip size="xs" value="nofs">无</Chip>
            <Chip size="xs" value="sync">SYNC</Chip>
            <Chip size="xs" value="fs">FS</Chip>
            <Chip size="xs" value="fsp">FS+</Chip>
            <Chip size="xs" value="fsd">FDX</Chip>
            <Chip size="xs" value="fsdp">FDX+</Chip>
          </Flex>
        </Chip.Group>
      </Input.Wrapper>
      <Divider my="xs" label="以下为选填参数" labelPosition="center" />
      <Grid mb="xs">
        <Grid.Col span={6}>
          <NumberInput
            label="DX 分数"
            placeholder="请输入 DX 分数"
            min={0}
            max={9999}
            allowDecimal={false}
            {...form.getInputProps("dx_score")}
          />
        </Grid.Col>
        <Grid.Col span={6}>
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
      <Text size="xs" mb="sm" c="gray">成绩保存后，你的玩家 DX Rating 将会自动更新。</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onClose()}>取消</Button>
        <Button type="submit" loading={uploading} disabled={song?.disabled}>保存</Button>
      </Group>
    </form>
  );
}
