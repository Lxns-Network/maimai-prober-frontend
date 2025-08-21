import {
  ActionIcon, Avatar, Button, Checkbox, Flex, Group, List, Mark, Modal, Paper, rem, Space, Text, TextInput, Tooltip,
  Box, Alert
} from "@mantine/core";
import { useEffect, useState } from "react";
import { mdiAlertCircle, mdiCancel } from "@mdi/js";
import Icon from "@mdi/react";
import {TransformedValues, useForm} from "@mantine/form";
import { IconAlertCircle, IconArrowsShuffle } from "@tabler/icons-react";
import { createAlias } from "@/utils/api/alias.ts";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../SongCombobox.tsx";
import { PhotoView } from "react-photo-view";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { ASSET_URL } from "@/main.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { Game } from "@/types/game";

interface FormValues {
  song_id: number | null;
  alias: string;
  agree?: boolean;
}

interface CreateAliasModalProps {
  game: Game;
  defaultSongId?: number;
  opened: boolean;
  onClose: (alias?: FormValues) => void;
}

export const CreateAliasModal = ({ game, defaultSongId, opened, onClose }: CreateAliasModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);

  const getSongList = useSongListStore((state) => state.getSongList);
  const form = useForm<FormValues>({
    initialValues: {
      song_id: null,
      alias: "",
      agree: false,
    },

    validate: {
      song_id: (value) => value !== null ? null : "请选择曲目",
      alias: (value, values) => {
        if (value.trim() === "") return "请输入曲目别名";
        if (!/^.{1,32}$/.test(value)) return "别名长度不符合要求";
        if (values.song_id && songList?.find(values.song_id)?.title.toLowerCase() === value.toLowerCase()) return "别名不能与曲目名称相同";
      },
      agree: (value) => value ? null : "请阅读并同意曲目别名命名规则",
    },

    transformValues: (values) => ({
      song_id: values.song_id ? parseInt(values.song_id.toString()) : null,
      alias: values.alias.trim(),
    }),
  });

  const createAliasHandler = async (values: TransformedValues<typeof form>) => {
    setUploading(true);

    try {
      const res = await createAlias(game, values);
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
      form.resetField("alias");
      onClose(values);
    } catch (error) {
      openRetryModal("别名创建失败", `${error}`, () => createAliasHandler(values));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    setSongList(getSongList(game));
  }, [game]);

  useEffect(() => {
    if (form.values.song_id) {
      const song = songList?.find(form.values.song_id);
      song && setSong(song);
    } else {
      setSong(null);
    }
  }, [form.values.song_id]);

  useEffect(() => {
    if (defaultSongId) {
      form.setValues({
        song_id: defaultSongId,
      });
      setReadonly(true);
    } else {
      form.reset();
      setReadonly(false);
    }
  }, [defaultSongId]);

  useEffect(() => {
    form.reset();
  }, [game]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>创建曲目别名</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={form.onSubmit(createAliasHandler)}>
            <Flex align="center" gap="md">
              {song ? (
                <PhotoView src={`${ASSET_URL}/${game}/jacket/${songList?.getSongResourceId(song.id)}.png`}>
                  <Avatar size={94} radius="md" src={`${ASSET_URL}/${game}/jacket/${songList?.getSongResourceId(song.id)}.png!webp`} />
                </PhotoView>
              ) : (
                <Avatar size={94} radius="md" src={null}>
                  <Text ta="center" fz="xs">请选择曲目</Text>
                </Avatar>
              )}
              <div style={{ flex: 1 }}>
                <Flex align="center" gap="xs">
                  <SongCombobox
                    value={form.values.song_id || 0}
                    onOptionSubmit={(value) => {
                      form.setValues({ song_id: value });
                    }}
                    disabled={readonly}
                    label="曲目"
                    mb="sm"
                    withAsterisk
                    error={form.errors.song_id}
                    style={{ flex: 1 }}
                  />
                  <Tooltip label="随机一首曲目" withinPortal>
                    <ActionIcon variant="default" size={24} onClick={() => {
                      const song = songList?.songs[Math.floor(Math.random() * songList?.songs.length)];
                      form.setValues({
                        song_id: song?.id,
                      });
                    }} mt={14} disabled={songList?.songs.length === 0 || readonly}>
                      <IconArrowsShuffle size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Flex>
                <TextInput
                  label="曲目别名"
                  placeholder="请输入曲目别名"
                  withAsterisk
                  {...form.getInputProps("alias")}
                />
              </div>
            </Flex>
            <Space h="md" />
            {Boolean(form.values.song_id) && ((game === "maimai" && form.values.song_id! >= 100000) || (game === "chunithm" && form.values.song_id! >= 8000)) && (
              <Alert color="yellow" variant="light" icon={<IconAlertCircle />} title="特殊曲目注意" mb="md">
                <Text size="sm">
                  你目前选中的是「{game === "maimai" ? "宴会场曲目" : "WORLD'S END 曲目"}」，请确认你要提交的是原曲还是特殊曲目。
                </Text>
              </Alert>
            )}
            <Checkbox
              label="我已阅读并理解曲目别名命名规则"
              {...form.getInputProps("agree", { type: 'checkbox' })}
            />
            <Space h="xs" />
            <Paper p="md" withBorder>
              <Text fz="sm" fw={700} mb="sm">曲目别名命名规则</Text>
              <List size="xs" icon={
                <Box h={18}>
                  <Icon color="orange" path={mdiAlertCircle} size={rem(18)} />
                </Box>
              }>
                <List.Item>不建议使用符号（全角或半角）、空格</List.Item>
                <List.Item>不建议使用重复的别名，除非曲目的知名度很高</List.Item>
                <List.Item>长度不应过长，且不应包含生僻字</List.Item>
                <List.Item icon={
                  <Box h={18}>
                    <Icon color="rgb(250,82,82)" path={mdiCancel} size={rem(18)} />
                  </Box>
                }>不允许包含<Mark>敏感内容</Mark>，或其他令人不适的内容</List.Item>
                <List.Item icon={
                  <Box h={18}>
                    <Icon color="rgb(250,82,82)" path={mdiCancel} size={rem(18)} />
                  </Box>
                }>不允许使用容易跟随版本变化而失效的别名</List.Item>
              </List>
            </Paper>
            <Space h="lg" />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => onClose()}>取消</Button>
              <Button type="submit" loading={uploading}>提交</Button>
            </Group>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}