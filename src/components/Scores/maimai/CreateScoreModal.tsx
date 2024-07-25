import {
  Avatar,
  Button,
  Chip, Divider, Flex, Grid,
  Group, Input,
  Modal, NumberInput,
  Select,
  Text
} from "@mantine/core";
import { useContext, useEffect, useState } from "react";
import { useForm } from "@mantine/form";
import { useComputedColorScheme } from "@mantine/core";
import {
  DifficultyProps,
  MaimaiDifficultiesProps,
  MaimaiSongList,
  MaimaiSongProps
} from "../../../utils/api/song/maimai.tsx";
import { openAlertModal, openConfirmModal, openRetryModal } from "../../../utils/modal.tsx";
import { DatesProvider, DateTimePicker } from "@mantine/dates";
import { createPlayerScore } from "../../../utils/api/player.tsx";
import { SongCombobox } from "../../SongCombobox.tsx";
import { MaimaiScoreProps } from "./Score.tsx";
import "dayjs/locale/zh-cn"
import { ApiContext } from "../../../App.tsx";
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "../../../main.tsx";

interface CreateScoreModalProps {
  songList: MaimaiSongList
  score?: MaimaiScoreProps | null;
  opened: boolean;
  onClose: (score?: any) => void;
}

export const MaimaiCreateScoreModal = ({ songList, score, opened, onClose }: CreateScoreModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [song, setSong] = useState<MaimaiSongProps | null>(null);
  const [difficulties, setDifficulties] = useState<DifficultyProps[] | null>(null);
  const computedColorScheme = useComputedColorScheme('light');
  const context = useContext(ApiContext);

  const form = useForm({
    initialValues: {
      id: score ? score.id : null,
      type: score ? score.type : null,
      difficulty: score ? score.level_index.toString() : null,
      achievements: null as number | null,
      fc: null as string | null,
      fs: null as string | null,
      dx_score: null as number | null,
      play_time: null as Date | null,
    },

    validate: {
      id: (value) => value !== null && value !== 0 ? null : "请选择曲目",
      type: (value) => value !== null ? null : "请选择谱面类型",
      difficulty: (value) => value !== null ? null : "请选择难度",
      achievements: (value) => value !== null ? null : "请输入达成率",
      fc: (value) => value !== null ? null : "请选择 Full Combo",
      fs: (value) => value !== null ? null : "请选择 Full Sync",
      play_time: (value) => !value || value <= new Date() ? null : "请选择正确的游玩时间",
    },
  });

  const createScoreHandler = async (values: any) => {
    setUploading(true);
    try {
      const score = {
        id: parseInt(values.id),
        type: values.type,
        level_index: parseInt(values.difficulty),
        achievements: values.achievements,
        fc: values.fc !== "nofc" ? values.fc : null,
        fs: values.fs !== "nofs" ? values.fs : null,
        dx_score: values.dx_score || 0,
        play_time: values.play_time ? values.play_time.toISOString().split('.')[0]+"Z" : null,
      }
      const res = await createPlayerScore("maimai", score);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
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
      onClose(score);
    } catch (error) {
      openRetryModal("成绩创建失败", `${error}`, () => createScoreHandler(values));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (score) form.setValues({
      id: score.id,
      type: null,
      difficulty: null,
    });
  }, [score]);

  useEffect(() => {
    setDifficulties(null);

    if (!form.values.id) return;

    setSong(songList.find(parseInt(form.values.id as any)));

    if (score) form.setValues({
      type: score.type,
    });
  }, [form.values.id]);

  useEffect(() => {
    if (!song || !form.values.type) return;

    setDifficulties(song.difficulties[form.values.type as keyof MaimaiDifficultiesProps]);

    if (score) form.setValues({
      difficulty: score.level_index.toString(),
    });
  }, [form.values.type]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>创建成绩</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={form.onSubmit((values) => {
            openConfirmModal("确认创建成绩", "你确定要创建成绩吗？我们不推荐手动维护成绩，这可能会导致未来 DX Rating 与游戏内显示不一致。", () => createScoreHandler(values));
          })}>
            <Flex align="center" gap="md">
              <SongDisabledIndicator disabled={song?.disabled}>
                <Avatar size={94} radius="md" src={
                  form.values.id ? `${ASSET_URL}/maimai/jacket/${context.songList.getSongResourceId(song)}.png!webp` : null
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
            <Input.Wrapper label="Full Combo" mb="xs" withAsterisk {...form.getInputProps("fc")}>
              <Chip.Group onChange={(value) => form.setValues({ fc: value as any })}>
                <Flex wrap="wrap" columnGap="md" rowGap="xs">
                  <Chip size="xs" value="nofc">无</Chip>
                  <Chip size="xs" value="fc">FC</Chip>
                  <Chip size="xs" value="fcp">FC+</Chip>
                  <Chip size="xs" value="ap">AP</Chip>
                  <Chip size="xs" value="app">AP+</Chip>
                </Flex>
              </Chip.Group>
            </Input.Wrapper>
            <Input.Wrapper label="Full Sync" mb="md" withAsterisk {...form.getInputProps("fs")}>
              <Chip.Group onChange={(value) => form.setValues({ fs: value as any })}>
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
                  {...form.getInputProps("dx_score")}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <DatesProvider settings={{ locale: 'zh-cn', firstDayOfWeek: 0, weekendDays: [0, 6], timezone: 'Asia/Shanghai' }}>
                  <DateTimePicker
                    label="游玩时间"
                    placeholder="请选择游玩时间"
                    valueFormat="YYYY-MM-DD HH:mm:ss"
                    excludeDate={(date) => date > new Date()}
                    clearable
                    {...form.getInputProps("play_time")}
                  />
                </DatesProvider>
              </Grid.Col>
            </Grid>
            <Text size="xs" mb="sm" c="gray">成绩保存后，你的玩家 DX Rating 将会自动更新。</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>取消</Button>
              <Button type="submit" loading={uploading} disabled={song?.disabled}>保存</Button>
            </Group>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}