import { ActionIcon, Button, Card, Container, Group, Menu, Progress } from "@mantine/core";
import { approveAlias, deleteAlias, deleteUserAlias, voteAlias } from "@/utils/api/alias.ts";
import { useSetState } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { checkPermission, getLoginUserId, UserPermission } from "@/utils/session.ts";
import { AliasButton } from "./AliasButton.tsx";
import {
  IconCheck, IconDotsVertical, IconFlag2Filled, IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled,
  IconTrash
} from "@tabler/icons-react";
import classes from "./Alias.module.css"
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import useFixedGame from "@/hooks/useFixedGame.ts";
import { AliasProps } from "@/types/alias";

interface AliasCardProps {
  alias: AliasProps;
  onClick: () => void;
  onVote: (vote: boolean) => void;
  onDelete: () => void;
}

export const Alias = ({ alias, onClick, onVote, onDelete }: AliasCardProps) => {
  const [game] = useFixedGame();
  const [displayAlias, setDisplayAlias] = useSetState(alias);
  const [weight, setWeight] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(0);

  const voteAliasHandler = async (alias_id: number, vote: boolean) => {
    setLoading(vote ? 1 : -1);
    try {
      const res = await voteAlias(game, alias_id, vote);
      if (res.status === 429) {
        openAlertModal("投票失败", "请求过于频繁，请稍后再试。");
        return
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      onVote(vote);
    } catch (err) {
      openRetryModal("投票失败", `${err}`, () => voteAliasHandler(alias_id, vote))
    } finally {
      setLoading(0);
    }
  }

  const deleteUserAliasHandler = async () => {
    try {
      let res;
      if (checkPermission(UserPermission.Administrator)) {
        res = await deleteAlias(game, alias.alias_id);
      } else {
        res = await deleteUserAlias(game, alias.alias_id);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      onDelete();
    } catch (error) {
      openRetryModal("曲目别名删除失败", `${error}`, deleteUserAliasHandler)
    }
  }

  useEffect(() => {
    if (alias.vote) setWeight(alias.vote.weight);

    if (alias.weight.total === 0) {
      setProgress(0);
    } else {
      setProgress((alias.weight.up / alias.weight.total) * 100);
    }
  }, [alias]);

  return (
    <Card shadow="xs" h={118.1} p={0} radius="md" withBorder>
      <Container className={classes.section} p={0} w="100%">
        <AliasButton alias={displayAlias} onClick={onClick} pt="xs" pb="xs" pl="sm" pr="sm" />
      </Container>
      <Container p={5} w="100%">
        <Group justify="space-between" gap={0} wrap="nowrap">
          <Button.Group borderWidth={0}>
            <Button className={classes.voteButton} variant="default" color="default" size="compact-md" leftSection={
              (weight === 1) ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} stroke={1.5} />
            } onClick={() => {
              voteAliasHandler(alias.alias_id, true);
            }} loading={loading === 1}>
              {alias.weight.up}
            </Button>
            <Button className={classes.voteButton} variant="default" color="default" size="compact-md" leftSection={
              (weight === -1) ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} stroke={1.5} />
            } onClick={() => {
              voteAliasHandler(alias.alias_id, false);
            }} loading={loading === 1}>
              {alias.weight.down}
            </Button>
          </Button.Group>
          <Menu shadow="md" width={200} withinPortal>
            <Menu.Target>
              <ActionIcon className={classes.voteButton} variant="default" color="default">
                <IconDotsVertical size={20} stroke={1.5} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>更多操作</Menu.Label>
              {checkPermission(UserPermission.Administrator) && !alias.approved && (
                <Menu.Item c="teal" leftSection={<IconCheck size={20} stroke={1.5} />} onClick={() => {
                  approveAlias(game, alias.alias_id).then(() => setDisplayAlias({ approved: true }));
                }}>批准</Menu.Item>
              )}
              {alias.uploader && alias.uploader.id !== getLoginUserId() && (
                <Menu.Item c="red" leftSection={<IconFlag2Filled size={20} stroke={1.5} />} disabled>举报滥用</Menu.Item>
              )}
              {(checkPermission(UserPermission.Administrator) || (alias.uploader && alias.uploader.id === getLoginUserId())) && (
                <Menu.Item c="red" leftSection={<IconTrash size={20} stroke={1.5} />} onClick={() => {
                  deleteUserAliasHandler();
                }}>删除</Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Container>
      <Progress size="xs" radius={0} value={progress} />
    </Card>
  )
}