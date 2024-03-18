import {
  ActionIcon,
  Avatar,
  Button,
  Checkbox, Flex,
  Group,
  List,
  Mark,
  Modal, Paper,
  rem,
  Select,
  Space, Text,
  TextInput, Tooltip
} from "@mantine/core";
import { useEffect, useState } from "react";
import { mdiAlertCircle, mdiCancel } from "@mdi/js";
import Icon from "@mdi/react";
import { useForm } from "@mantine/form";
import { IconArrowsShuffle } from "@tabler/icons-react";
import { MaimaiSongList } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList } from "../../utils/api/song/chunithm.tsx";
import { SongList } from "../../utils/api/song/song.tsx";
import { createAlias } from "../../utils/api/alias.tsx";
import { useComputedColorScheme } from "@mantine/core";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../SongCombobox.tsx";

interface CreateAliasModalProps {
  defaultSongId?: number;
  defaultSongList?: SongList;
  opened: boolean;
  onClose: (alias?: any) => void;
}

export const CreateAliasModal = ({ defaultSongId, defaultSongList, opened, onClose }: CreateAliasModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [songList, setSongList] = useState(new SongList());
  const [songs, setSongs] = useState([] as any[]);
  const [readonly, setReadonly] = useState(false);
  const computedColorScheme = useComputedColorScheme('light');

  const form = useForm({
    initialValues: {
      game: null as "maimai" | "chunithm" | null,
      songId: null as number | null,
      alias: "",
      agree: false,
    },

    validate: {
      game: (value) => value !== null ? null : "请选择曲目所属游戏",
      songId: (value) => value !== null ? null : "请选择曲目",
      alias: (value, values) => {
        if (value === "") return "请输入曲目别名";
        if (!/^.{1,32}$/.test(value)) return "别名长度不符合要求";
        if (values.songId && songList.find(values.songId)?.title.toLowerCase() === value.toLowerCase()) return "别名不能与曲目名称相同";
      },
      agree: (value) => value ? null : "请阅读并同意曲目别名命名规则",
    },
  });

  const createAliasHandler = async (values: any) => {
    setUploading(true);
    try {
      const alias = {
        song_id: parseInt(values.songId),
        alias: values.alias,
      }
      const res = await createAlias(values.game, alias);
      if (res.status === 409) {
        openAlertModal("别名创建失败", "别名已存在，请输入其它曲目别名。");
        setUploading(false);
        return
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("别名创建成功", "快去邀请你的小伙伴投票吧。")
      form.setValues({
        alias: "",
      });
      onClose(alias);
    } catch (error) {
      openRetryModal("别名创建失败", `${error}`, () => createAliasHandler(values));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    songList.fetch().then(() => {
      setSongs(songList.songs);
    });
  }, [songList]);

  useEffect(() => {
    if (defaultSongList) {
      form.setValues({
        game: defaultSongList instanceof MaimaiSongList ? "maimai" : "chunithm",
      });
      setReadonly(true);
      setSongList(defaultSongList);
    }
  }, [defaultSongList]);

  useEffect(() => {
    if (defaultSongId) {
      form.setValues({
        songId: defaultSongId,
      });
    }
  }, [defaultSongId]);

  useEffect(() => {
    if (!form.values.game) return;

    if (form.values.game === "maimai") {
      setSongList(new MaimaiSongList());
    } else {
      setSongList(new ChunithmSongList());
    }
    form.setValues({
      songId: defaultSongId || null,
      alias: "",
    });
  }, [form.values.game]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>创建曲目别名</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={form.onSubmit((values) => createAliasHandler(values))}>
            <Flex align="center" gap="md">
              <Avatar size={94} radius="md" src={
                (form.values.game && form.values.songId) ? `https://assets.lxns.net/${form.values.game}/jacket/${form.values.songId}.png!webp` : null
              } styles={(theme) => ({
                root: {
                  backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
                }
              })}>
                <Text ta="center" fz="xs">请选择曲目</Text>
              </Avatar>
              <div style={{ flex: 1 }}>
                <Select
                  label="曲目所属游戏"
                  placeholder="请选择曲目所属游戏"
                  comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                  mb="xs"
                  data={[
                    { value: 'maimai', label: '舞萌 DX' },
                    { value: 'chunithm', label: '中二节奏' },
                  ]}
                  disabled={readonly}
                  withAsterisk
                  {...form.getInputProps('game')}
                />
                <Flex align="center" gap="xs">
                  <SongCombobox
                    songs={songs}
                    value={form.values.songId || 0}
                    onOptionSubmit={(value) => {
                      form.setValues({ songId: value });
                    }}
                    disabled={readonly}
                    label="曲目"
                    mb="sm"
                    withAsterisk
                    error={form.errors.id}
                    style={{ flex: 1 }}
                  />
                  <Tooltip label="随机一首曲目" withinPortal>
                    <ActionIcon variant="default" size={24} onClick={() => {
                      const song = songList.songs[Math.floor(Math.random() * songList.songs.length)];
                      form.setValues({
                        songId: song.id,
                      });
                    }} mt={14} disabled={songList.songs.length === 0 || readonly}>
                      <IconArrowsShuffle size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Flex>
              </div>
            </Flex>
            <TextInput
              label="曲目别名"
              placeholder="请输入曲目别名"
              withAsterisk
              {...form.getInputProps("alias")}
            />
            <Space h="md" />
            <Checkbox
              label="我已阅读并理解曲目别名命名规则"
              {...form.getInputProps("agree", { type: 'checkbox' })}
            />
            <Space h="xs" />
            <Paper p="md" withBorder>
              <Text fz="sm" fw={700} mb="sm">曲目别名命名规则</Text>
              <List size="xs" icon={
                <Icon color="orange" path={mdiAlertCircle} size={rem(18)} />
              }>
                <List.Item>不建议使用符号（全角或半角）、空格</List.Item>
                <List.Item>不建议使用重复的别名，除非曲目的知名度很高</List.Item>
                <List.Item>长度不应过长，且不应包含生僻字</List.Item>
                <List.Item icon={
                  <Icon color="rgb(250,82,82)" path={mdiCancel} size={rem(18)} />
                }>不允许包含<Mark>敏感内容</Mark>，或其他令人不适的内容</List.Item>
                <List.Item icon={
                  <Icon color="rgb(250,82,82)" path={mdiCancel} size={rem(18)} />
                }>不允许使用容易跟随版本变化而失效的别名</List.Item>
              </List>
            </Paper>
            <Space h="lg" />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>取消</Button>
              <Button type="submit" loading={uploading}>提交</Button>
            </Group>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}