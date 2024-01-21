import {
  ActionIcon,
  Card,
  Container,
  Flex,
  Group,
  Menu,
  Progress,
  Text, Tooltip
} from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { approveAlias, deleteAlias, deleteUserAlias, voteAlias } from "../../utils/api/alias.tsx";
import { useElementSize, useLocalStorage, useSetState } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { checkPermission, getLoginUserId, UserPermission } from "../../utils/session.tsx";
import { AliasButton } from "./AliasButton.tsx";
import {
  IconCheck, IconDotsVertical,
  IconFlag2Filled,
  IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled,
  IconTrash, IconUser
} from "@tabler/icons-react";
import classes from "./Alias.module.css"
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";

export const Alias = ({ alias, onClick, onDelete }: { alias: AliasProps, onClick: () => void, onDelete: () => void }) => {
  const { ref, width } = useElementSize();
  const [displayAlias, setDisplayAlias] = useSetState(alias);
  const [weight, setWeight] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(0);
  const [game] = useLocalStorage({ key: 'game' });

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
      if (weight === 0) { // 没有投票
        alias.weight.up += vote ? 1 : 0;
        alias.weight.down += vote ? 0 : 1;
        alias.weight.total += 1;
      } else if (weight === 1) { // 取消支持
        alias.weight.up -= 1;
        alias.weight.down += vote ? 0 : 1;
        alias.weight.total += vote ? -1 : 0;
      } else if (weight === -1) { // 取消反对
        alias.weight.down -= 1;
        alias.weight.up += vote ? 1 : 0;
        alias.weight.total += vote ? 0 : -1;
      }
      if (alias.weight.total === 0) {
        setProgress(0);
      } else {
        setProgress((alias.weight.up / alias.weight.total) * 100);
      }
      setWeight((weight === (vote ? 1 : -1)) ? 0 : (vote ? 1 : -1))
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
    if (alias.weight.total === 0) {
      setProgress(0);
    } else {
      setProgress((alias.weight.up / alias.weight.total) * 100);
    }
    if (alias.vote) {
      setWeight(alias.vote.weight);
    }
  }, [alias]);

  return (
    <Card ref={ref} shadow="xs" p={0} radius="md" withBorder>
      <Container className={classes.section} p={0} w="100%">
        <AliasButton alias={displayAlias} onClick={onClick} pt="xs" pb="xs" pl="sm" pr="sm" />
      </Container>
      <Container pt={5} pb={5} pl="xs" pr="xs" w="100%">
        <Group justify="space-between" wrap="nowrap">
          <Flex gap={4} align="center">
            <IconUser color="gray" size={20} />
            <Text c="dimmed" fz="sm" truncate style={{
              maxWidth: "70px"
            }}>{alias.uploader ? alias.uploader.name : "未知"}</Text>
          </Flex>
          <Flex gap={5}>
            {width >= 220 && (
              <>
                <Tooltip label={(weight === 1) ? "取消支持" : "支持"}>
                  <ActionIcon variant="subtle" color="default" onClick={() => {
                    voteAliasHandler(alias.alias_id, true);
                  }} loading={loading === 1}>
                    {(weight === 1) ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={(weight === -1) ? "取消反对" : "反对"}>
                  <ActionIcon variant="subtle" color="default" onClick={() => {
                    voteAliasHandler(alias.alias_id, false);
                  }} loading={loading === -1}>
                    {(weight === -1) ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />}
                  </ActionIcon>
                </Tooltip>
              </>
            )}
            <Menu trigger="hover" shadow="md" width={200} withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="default">
                  <IconDotsVertical size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>更多操作</Menu.Label>
                {width < 220 && (
                  <>
                    <Menu.Item leftSection={(weight === 1) ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />} onClick={() => {
                      voteAliasHandler(alias.alias_id, true);
                    }}>{(weight === 1) ? "取消支持" : "支持"}</Menu.Item>
                    <Menu.Item leftSection={(weight === -1) ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />} onClick={() => {
                      voteAliasHandler(alias.alias_id, false);
                    }}>{(weight === -1) ? "取消反对" : "反对"}</Menu.Item>
                  </>
                )}
                {checkPermission(UserPermission.Administrator) && !alias.approved && (
                  <Menu.Item c="teal" leftSection={<IconCheck size={20} />} onClick={() => {
                    approveAlias(game, alias.alias_id).then(() => setDisplayAlias({ approved: true }));
                  }}>批准</Menu.Item>
                )}
                {alias.uploader && alias.uploader.id !== getLoginUserId() && (
                  <Menu.Item c="red" leftSection={<IconFlag2Filled size={20} />} disabled>举报滥用</Menu.Item>
                )}
                {(checkPermission(UserPermission.Administrator) || alias.uploader.id === getLoginUserId()) && (
                  <Menu.Item c="red" leftSection={<IconTrash size={20} />} onClick={() => {
                    deleteUserAliasHandler();
                  }}>删除</Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Flex>
        </Group>
      </Container>
      <Tooltip label={`${alias.weight.up} / ${alias.weight.down}`} withinPortal>
        <Progress radius={0} h={3} value={progress} />
      </Tooltip>
    </Card>
  )
}