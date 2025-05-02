import {
  ActionIcon, Avatar, Badge, Flex, Group, Modal, Progress, Space, Text, ThemeIcon, Tooltip
} from "@mantine/core";
import { useEffect, useState } from "react";
import { voteAlias } from "@/utils/api/alias.ts";
import {
  IconCheck, IconNorthStar, IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled
} from "@tabler/icons-react";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { PhotoView } from "react-photo-view";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ASSET_URL } from "@/main.tsx";
import useFixedGame from "@/hooks/useFixedGame.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { AliasProps } from "@/types/alias";

interface AliasModalProps {
  alias: AliasProps;
  setAlias: (alias: AliasProps) => void;
  opened: boolean;
  onClose: () => void;
}

export function calculateNewAliasWeight(
  alias: AliasProps,
  vote: boolean // true: 支持, false: 反对
): AliasProps {
  let { up, down, total } = alias.weight;
  const current = alias.vote?.weight;
  const isUpvote = vote;

  if (current === 0) {
    if (isUpvote) { up++; total++; }
    else { down++; total++; }
  } else if (current === 1) {
    if (isUpvote) { up--; total--; } // 取消支持
    else { up--; down++; } // 改为反对
  } else if (current === -1) {
    if (!isUpvote) { down--; total--; } // 取消反对
    else { down--; up++; } // 改为支持
  }

  const newWeight = (current === (isUpvote ? 1 : -1)) ? 0 : (isUpvote ? 1 : -1);

  return {
    ...alias,
    weight: { up, down, total },
    vote: {
      ...alias.vote,
      weight: newWeight,
    }
  };
}

const AliasModalBody = ({ alias, setAlias }: { alias: AliasProps, setAlias: (alias: AliasProps) => void }) => {
  if (!alias) return null;

  const [progress, setProgress] = useState(0);
  const [weight, setWeight] = useState(0);
  const [loading, setLoading] = useState(0);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [game] = useFixedGame();

  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state[game] })),
  )

  useEffect(() => {
    setSong(songList.find(alias.song.id) || null);
    setProgress((alias.weight.up / alias.weight.total) * 100);
  }, []);

  useEffect(() => {
    if (alias.vote) setWeight(alias.vote.weight);

    if (alias.weight.total === 0) {
      setProgress(0);
    } else {
      setProgress((alias.weight.up / alias.weight.total) * 100);
    }
  }, [alias]);

  const voteAliasHandler = async (alias_id: number, vote: boolean) => {
    setLoading(vote ? 1 : -1);
    try {
      const res = await voteAlias(game, alias_id, vote);
      if (res.status === 429) {
        openAlertModal("投票失败", "请求过于频繁，请稍后再试。")
        return
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setAlias(calculateNewAliasWeight(alias, vote));
    } catch (err) {
      openRetryModal("投票失败", `${err}`, () => voteAliasHandler(alias_id, vote))
    } finally {
      setLoading(0);
    }
  }

  return (
    <>
      <Group>
        {game && (
          <PhotoView src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song ? song.id : 0)}.png`}>
            <Avatar src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song ? song.id : 0)}.png!webp`} size={94} radius="md">
              <Text ta="center" fz="xs">曲绘加载失败</Text>
            </Avatar>
          </PhotoView>
        )}
        <div style={{ flex: 1 }}>
          <div>
            <Text fz="xs" c="dimmed">曲名</Text>
            <Group gap="xs">
              <Text>{alias.song.name || "未知"}</Text>
              {game === "maimai" && alias.song.id >= 100000 && (
                <Badge variant="filled" color="rgb(234, 61, 232)" size="sm">
                  宴
                </Badge>
              )}
              {game === "chunithm" && alias.song.id >= 8000 && (
                <Badge variant="filled" color="rgb(14, 45, 56)" size="sm">
                  {song && (song as ChunithmSongProps).difficulties[0].kanji}
                </Badge>
              )}
            </Group>
          </div>
          <Space h="xs" />
          <div>
            <Text fz="xs" c="dimmed">曲目别名</Text>
            <Text fz="xl" fw={700}>{alias.alias}</Text>
          </div>
        </div>
        <Flex direction="column" gap="xs">
          {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
            <Tooltip label="新提交" withinPortal>
              <ThemeIcon color="yellow" radius="xl" variant="light">
                <IconNorthStar />
              </ThemeIcon>
            </Tooltip>
          )}
          {alias.approved && (
            <Tooltip label="已批准" withinPortal>
              <ThemeIcon color="teal" radius="xl" variant="light">
                <IconCheck />
              </ThemeIcon>
            </Tooltip>
          )}
        </Flex>
      </Group>
      <Space h="md" />
      <Group grow>
        <div>
          <Text fz="xs" c="dimmed">提交者</Text>
          <Text>{alias.uploader ? alias.uploader.name : "未知"}</Text>
        </div>
        <div>
          <Text fz="xs" c="dimmed">提交时间</Text>
          <Text>{new Date(alias.upload_time).toLocaleString()}</Text>
        </div>
      </Group>
      <Space h="md" />
      <div>
        <Text fz="xs" c="dimmed">投票占比</Text>
        <Progress.Root size="xl" mt={4}>
          <Tooltip label={`共 ${alias.weight.up} 人`}>
            <Progress.Section value={progress} color="blue">
              <Progress.Label>支持</Progress.Label>
            </Progress.Section>
          </Tooltip>
          <Tooltip label={`共 ${alias.weight.down} 人`}>
            <Progress.Section value={100 - progress} color="gray">
              <Progress.Label>{alias.weight.total === 0 ? '暂无投票' : '反对'}</Progress.Label>
            </Progress.Section>
          </Tooltip>
        </Progress.Root>
      </div>
      <Space h="xl" />
      <Flex align="center" direction="column" gap="xs">
        <Text fz="xs" c="dimmed">你的投票</Text>
        <Group>
          <ActionIcon color="teal" size="xl" variant={(weight === 1) ? "filled" : "light"} onClick={() => {
            voteAliasHandler(alias.alias_id, true);
          }} loading={loading === 1}>
            {(weight === 1) ? <IconThumbUpFilled /> : <IconThumbUp />}
          </ActionIcon>
          <ActionIcon color="red" size="xl" variant={(weight === -1) ? "filled" : "light"} onClick={() => {
            voteAliasHandler(alias.alias_id, false);
          }} loading={loading === -1}>
            {(weight === -1) ? <IconThumbDownFilled /> : <IconThumbDown />}
          </ActionIcon>
        </Group>
        <Text fz="xs" c="dimmed">共 {alias.weight.total} 人投票</Text>
      </Flex>
    </>
  );
}

export const AliasModal = ({ alias, setAlias, opened, onClose }: AliasModalProps) => {
  return (
    <Modal.Root opened={opened} onClose={() => onClose()} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>曲目别名详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          {alias !== null && (
            <AliasModalBody alias={alias} setAlias={setAlias} />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}