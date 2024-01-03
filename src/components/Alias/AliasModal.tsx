import {
  ActionIcon,
  Avatar, Flex, Group,
  Modal, Progress, rem, Space, Text, ThemeIcon, Tooltip
} from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { useLocalStorage } from "@mantine/hooks";
import Icon from "@mdi/react";
import {
  mdiCheck,
  mdiCreation,
} from "@mdi/js";
import { useEffect, useState } from "react";
import { voteAlias } from "../../utils/api/alias.tsx";
import { notifications } from "@mantine/notifications";
import { IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled } from "@tabler/icons-react";

interface AliasModalProps {
  alias: AliasProps;
  setAlias: (alias: AliasProps) => void;
  opened: boolean;
  onClose: () => void;
}

const AliasModalBody = ({ alias, setAlias }: { alias: AliasProps, setAlias: (alias: AliasProps) => void }) => {
  const [game] = useLocalStorage({ key: 'game' });
  const [progress, setProgress] = useState(0);
  const [weight, setWeight] = useState(0);
  const [loading, setLoading] = useState(0);

  if (!alias) return null;

  useEffect(() => {
    setProgress((alias.weight.up / alias.weight.total) * 100);

    if (!alias.vote) return;

    setWeight(alias.vote.weight);
  }, []);

  useEffect(() => {
    if (alias.weight.total === 0) {
      setProgress(0);
    } else {
      setProgress((alias.weight.up / alias.weight.total) * 100);
    }
  }, [alias]);

  const voteAliasHandler = async (alias_id: number, vote: boolean) => {
    if (!game) return;

    setLoading(vote ? 1 : -1);
    try {
      const res = await voteAlias(game, alias_id, vote);
      if (res.status === 429) {
        notifications.show({
          title: '请求过于频繁',
          message: '请稍后再试',
          color: 'red',
        });
        return
      } else if (res.status !== 200) {
        return
      }
      let weightProps;
      if (weight === 0) { // 没有投票
        weightProps = {
          up: alias.weight.up + (vote ? 1 : 0),
          down: alias.weight.down + (vote ? 0 : 1),
          total: alias.weight.total + 1,
        }
      } else if (weight === 1) { // 取消支持
        weightProps = {
          up: alias.weight.up - 1,
          down: alias.weight.down + (vote ? 0 : 1),
          total: alias.weight.total + (vote ? -1 : 0),
        }
      } else if (weight === -1) { // 取消反对
        weightProps = {
          down: alias.weight.down - 1,
          up: alias.weight.up + (vote ? 1 : 0),
          total: alias.weight.total + (vote ? 0 : -1),
        }
      }
      setAlias({
        weight: weightProps,
        vote: {
          ...alias.vote,
          weight: (weight === (vote ? 1 : -1)) ? 0 : (vote ? 1 : -1),
        }
      } as AliasProps);
      setWeight((weight === (vote ? 1 : -1)) ? 0 : (vote ? 1 : -1))
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(0);
    }
  }

  return (
    <>
      <Group>
        {game && (
          <Avatar src={`https://lxns.org/${game}/jacket/${alias.song.id}.png`} size={94} radius="md">
            <Text align="center" fz="xs">曲绘加载失败</Text>
          </Avatar>
        )}
        <div style={{ flex: 1 }}>
          <div>
            <Text fz="xs" c="dimmed">曲名</Text>
            <Text truncate>{alias.song.name}</Text>
          </div>
          <Space h="xs" />
          <div>
            <Text fz="xs" c="dimmed">曲目别名</Text>
            <Text fz="xl" weight={700} truncate>{alias.alias}</Text>
          </div>
        </div>
        <Flex direction="column" gap="xs">
          {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
            <Tooltip label="新提交" withinPortal>
              <ThemeIcon color="yellow" radius="xl" variant="light">
                <Icon path={mdiCreation} size={rem(20)} />
              </ThemeIcon>
            </Tooltip>
          )}
          {alias.approved && (
            <Tooltip label="已批准" withinPortal>
              <ThemeIcon color="teal" radius="xl" variant="light">
                <Icon path={mdiCheck} size={rem(20)} />
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
        <Progress
          mt={4}
          size={20}
          sections={[
            { value: progress, color: 'blue', label: '支持', tooltip: `共 ${alias.weight.up} 人` },
            { value: 100 - progress, color: 'gray', label: alias.weight.total === 0 ? '暂无投票' : '反对', tooltip: `共 ${alias.weight.down} 人` },
          ]}
        />
      </div>
      <Space h="xl" />
      <Flex align="center" direction="column" gap="xs">
        <Text fz="xs" c="dimmed">你的投票</Text>
        <Group>
          <Tooltip label={(weight === 1) ? "取消支持" : "支持"}>
            <ActionIcon color="green" size="xl" variant={(weight === 1) ? "filled" : "light"} onClick={() => {
              voteAliasHandler(alias.alias_id, true);
            }} loading={loading === 1}>
              {(weight === 1) ? <IconThumbUpFilled /> : <IconThumbUp />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label={(weight === -1) ? "取消反对" : "反对"}>
            <ActionIcon color="red" size="xl" variant={(weight === -1) ? "filled" : "light"} onClick={() => {
              voteAliasHandler(alias.alias_id, false);
            }} loading={loading === -1}>
              {(weight === -1) ? <IconThumbDownFilled /> : <IconThumbDown />}
            </ActionIcon>
          </Tooltip>
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