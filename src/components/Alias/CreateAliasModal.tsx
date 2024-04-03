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
  Space, Text,
  TextInput, Tooltip
} from "@mantine/core";
import { useContext, useEffect, useState } from "react";
import { mdiAlertCircle, mdiCancel } from "@mdi/js";
import Icon from "@mdi/react";
import { useForm } from "@mantine/form";
import { IconArrowsShuffle } from "@tabler/icons-react";
import { createAlias } from "../../utils/api/alias.tsx";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../SongCombobox.tsx";
import { ApiContext } from "../../App.tsx";
import { useLocalStorage } from "@mantine/hooks";
import { PhotoView } from "react-photo-view";

interface CreateAliasModalProps {
  defaultSongId?: number;
  opened: boolean;
  onClose: (alias?: any) => void;
}

export const CreateAliasModal = ({ defaultSongId, opened, onClose }: CreateAliasModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [game] = useLocalStorage({ key: 'game' })
  const context = useContext(ApiContext);
  const form = useForm({
    initialValues: {
      songId: null as number | null,
      alias: "",
      agree: false,
    },

    validate: {
      songId: (value) => value !== null ? null : "请选择曲目",
      alias: (value, values) => {
        if (value === "") return "请输入曲目别名";
        if (!/^.{1,32}$/.test(value)) return "别名长度不符合要求";
        if (values.songId && context.songList.find(values.songId)?.title.toLowerCase() === value.toLowerCase()) return "别名不能与曲目名称相同";
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
      const res = await createAlias(game, alias);
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
    if (defaultSongId) {
      form.setValues({
        songId: defaultSongId,
      });
      setReadonly(true);
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
          <form onSubmit={form.onSubmit((values) => createAliasHandler(values))}>
            <Flex align="center" gap="md">
              {form.values.songId ? (
                <PhotoView src={`https://assets.lxns.net/${game}/jacket/${form.values.songId}.png`}>
                  <Avatar size={94} radius="md" src={`https://assets.lxns.net/${game}/jacket/${form.values.songId}.png!webp`} />
                </PhotoView>
              ) : (
                <Avatar size={94} radius="md" src={null}>
                  <Text ta="center" fz="xs">请选择曲目</Text>
                </Avatar>
              )}
              <div style={{ flex: 1 }}>
                <Flex align="center" gap="xs">
                  <SongCombobox
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
                      const song = context.songList.songs[Math.floor(Math.random() * context.songList.songs.length)];
                      form.setValues({
                        songId: song.id,
                      });
                    }} mt={14} disabled={context.songList.songs.length === 0 || readonly}>
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