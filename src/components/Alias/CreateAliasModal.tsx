import {
  ActionIcon,
  Avatar,
  Button,
  Checkbox, Flex,
  Group,
  List,
  Loader,
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

interface CreateAliasModalProps {
  opened: boolean;
  onClose: () => void;
}

export const CreateAliasModal = ({ opened, onClose }: CreateAliasModalProps) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [songList, setSongList] = useState(new SongList());
  const computedColorScheme = useComputedColorScheme('light');

  const form = useForm({
    initialValues: {
      game: null,
      songId: null,
      alias: "",
      agree: false,
    },

    validate: {
      game: (value) => value !== null ? null : "请选择曲目所属游戏",
      songId: (value) => value !== null ? null : "请选择曲目",
      alias: (value, values) => {
        if (value === "") return "请输入曲目别名";
        if (!/^.{1,32}$/.test(value)) return "别名长度不符合要求";
        if (values.songId && songList.find(parseInt(values.songId))?.title.toLowerCase() === value.toLowerCase()) return "别名不能与曲目名称相同";
      },
      agree: (value) => value ? null : "请阅读并同意曲目别名命名规则",
    },
  });

  const createAliasHandler = async (values: any) => {
    setUploading(true);
    try {
      const res = await createAlias(values.game, {
        song_id: parseInt(values.songId),
        alias: values.alias,
      });
      if (res.status === 409) {
        openAlertModal("别名创建失败", "别名已存在，请输入其它曲目别名。");
        setUploading(false);
        return
      } else if (res.status !== 200) {
        setUploading(false);
        return
      }
      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(data.message);
      }
      openAlertModal("别名创建成功", "快去邀请你的小伙伴投票吧。")
      form.setValues({
        alias: "",
      });
      onClose();
    } catch (error) {
      openRetryModal("别名创建失败", `${error}`, () => createAliasHandler(values));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    songList.fetch().then(() => {
      setLoading(false);
    });
  }, [songList]);

  useEffect(() => {
    if (!form.values.game) return;

    if (form.values.game === "maimai") {
      setSongList(new MaimaiSongList());
    } else {
      setSongList(new ChunithmSongList());
    }
    form.setValues({
      songId: null,
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
                (form.values.game && form.values.songId) ? `https://lxns.org/${form.values.game}/jacket/${form.values.songId}.png` : null
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
                  comboboxProps={{ position: 'bottom' }}
                  mb="xs"
                  data={[
                    { value: 'maimai', label: '舞萌 DX' },
                    { value: 'chunithm', label: '中二节奏' },
                  ]}
                  withAsterisk
                  {...form.getInputProps('game')}
                />
                <Flex align="end" mb="xs" gap="xs">
                  <Select
                    label="曲目"
                    placeholder="请选择曲目"
                    comboboxProps={{ position: 'bottom' }}
                    data={songList.songs.map((song: any) => ({
                      value: song.id.toString(),
                      label: song.title,
                    }))}
                    leftSection={loading ? <Loader size={rem(16)} /> : undefined}
                    disabled={songList.songs.length === 0}
                    searchable
                    withAsterisk
                    style={{ flex: 1 }}
                    {...form.getInputProps('songId')}
                  />
                  <Tooltip label="随机一首曲目" withinPortal>
                    <ActionIcon variant="subtle" color="default" size={rem(24)} onClick={() => {
                      const song = songList.songs[Math.floor(Math.random() * songList.songs.length)];
                      form.setValues({
                        songId: song.id.toString() as any,
                      });
                    }} mb={6} disabled={songList.songs.length === 0}>
                      <IconArrowsShuffle />
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
            <Space h="xl" />
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