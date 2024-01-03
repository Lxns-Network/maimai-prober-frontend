import {
  ActionIcon,
  Card,
  Container,
  createStyles,
  Flex,
  Group,
  Menu,
  Progress,
  rem,
  Text, Tooltip
} from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { approveAlias, deleteAlias, deleteUserAlias, voteAlias } from "../../utils/api/alias.tsx";
import {useElementSize, useLocalStorage, useSetState} from "@mantine/hooks";
import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { checkPermission, getLoginUserId, UserPermission } from "../../utils/session.tsx";
import { AliasButton } from "./AliasButton.tsx";
import {
  IconCheck, IconDotsVertical,
  IconFlag2Filled,
  IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled,
  IconTrash, IconUser
} from "@tabler/icons-react";

const useStyles = createStyles((theme) => ({
  section: {
    borderBottom: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },
}));

export const Alias = ({ alias, onClick, onDelete }: { alias: AliasProps, onClick: () => void, onDelete: () => void }) => {
  const { classes } = useStyles();
  const { ref, width } = useElementSize();
  const [displayAlias, setDisplayAlias] = useSetState(alias);
  const [weight, setWeight] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(0);
  const [game] = useLocalStorage({ key: 'game' });

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
      console.log(err);
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
      if (res.status !== 200) {
        notifications.show({
          title: `删除别名失败`,
          message: `别名 ${alias.alias} 删除失败`,
          color: 'red',
        });
        return;
      }
      onDelete();
    } catch (err) {
      console.log(err);
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
      <Container className={classes.section} p={0}>
        <AliasButton alias={displayAlias} onClick={onClick} pt="xs" pb="xs" pl="sm" pr="sm" />
      </Container>
      <Container pt={5} pb={5} pl="xs" pr="xs">
        <Group position="apart" noWrap>
          <Flex gap={4} align="center">
            <IconUser color="gray" size={20} />
            <Text color="dimmed" fz="sm" truncate style={{
              maxWidth: "70px"
            }}>{alias.uploader ? alias.uploader.name : "未知"}</Text>
          </Flex>
          <Flex gap={5}>
            {width >= 220 && (
              <>
                <Tooltip label={(weight === 1) ? "取消支持" : "支持"}>
                  <ActionIcon onClick={() => {
                    voteAliasHandler(alias.alias_id, true);
                  }} loading={loading === 1}>
                    {(weight === 1) ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={(weight === -1) ? "取消反对" : "反对"}>
                  <ActionIcon onClick={() => {
                    voteAliasHandler(alias.alias_id, false);
                  }} loading={loading === -1}>
                    {(weight === -1) ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />}
                  </ActionIcon>
                </Tooltip>
              </>
            )}
            <Menu trigger="hover" shadow="md" width={200} withinPortal>
              <Menu.Target>
                <ActionIcon>
                  <IconDotsVertical size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>更多操作</Menu.Label>
                {width < 220 && (
                  <>
                    <Menu.Item icon={(weight === 1) ? <IconThumbUpFilled size={20} /> : <IconThumbUp size={20} />} onClick={() => {
                      voteAliasHandler(alias.alias_id, true);
                    }}>{(weight === 1) ? "取消支持" : "支持"}</Menu.Item>
                    <Menu.Item icon={(weight === -1) ? <IconThumbDownFilled size={20} /> : <IconThumbDown size={20} />} onClick={() => {
                      voteAliasHandler(alias.alias_id, false);
                    }}>{(weight === -1) ? "取消反对" : "反对"}</Menu.Item>
                  </>
                )}
                {checkPermission(UserPermission.Administrator) && !alias.approved && (
                  <Menu.Item c="teal" icon={<IconCheck size={20} />} onClick={() => {
                    approveAlias(game, alias.alias_id).then(() => setDisplayAlias({ approved: true }));
                  }}>批准</Menu.Item>
                )}
                {alias.uploader && alias.uploader.id !== getLoginUserId() && (
                  <Menu.Item c="red" icon={<IconFlag2Filled size={20} />} disabled>举报滥用</Menu.Item>
                )}
                {(checkPermission(UserPermission.Administrator) || alias.uploader.id === getLoginUserId()) && (
                  <Menu.Item c="red" icon={<IconTrash size={20} />} onClick={() => {
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