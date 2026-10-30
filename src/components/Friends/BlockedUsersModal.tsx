import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Pagination,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconShield, IconShieldOff, IconUser, IconUserX } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import profileClasses from "@/components/Profile/Profile.module.css";
import { useBlockedUsers } from "@/hooks/queries/useFriends";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useFriendRelationActions } from "@/hooks/useFriendRelationActions";
import useFriendStore from "@/hooks/useFriendStore";
import { getFriendLoadErrorMessage } from "@/utils/api/friend";
import { formatDateTime } from "@/utils/time";
import { LoadingBlock } from "./LoadingBlock";

export const BlockedUsersModal = () => {
  const { blocksOpened, closeBlocks } = useFriendStore();
  const small = useMediaQuery("(max-width: 30rem)");
  const [page, setPage] = useState(1);

  useBackDismiss(blocksOpened, closeBlocks);

  const { data, blocks, total, pageSize, isLoading, error, refetch } = useBlockedUsers(
    page,
    20,
    blocksOpened,
  );
  const { unblock, pendingUnblockId } = useFriendRelationActions();

  const totalPages = Math.ceil(total / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));

  // 解除末页的全部拉黑后退回仍有数据的末页，否则会停在空页且分页控件被隐藏。
  useEffect(() => {
    if (data && page > currentPage) setPage(currentPage);
  }, [data, page, currentPage]);

  const renderList = () => {
    if (isLoading) return <LoadingBlock />;

    if (error && !data) {
      return (
        <QueryErrorState
          title="黑名单加载失败"
          description={getFriendLoadErrorMessage(error)}
          onRetry={() => void refetch()}
          iconSize={48}
        />
      );
    }

    if (blocks.length === 0) {
      return (
        <EmptyState
          icon={<IconUserX size={48} stroke={1.5} />}
          title="黑名单为空"
          description="你目前没有拉黑任何用户"
        />
      );
    }

    return (
      <Stack gap="xs">
        {blocks.map((item) => (
          <Card key={item.user_id} withBorder radius="md" p="xs" className={profileClasses.card}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" flex={1} miw={0}>
                <ThemeIcon variant="light" color="gray" size="md" radius="md">
                  <IconUser size={16} />
                </ThemeIcon>
                <Box miw={0}>
                  <Text fw={600} size="sm" truncate="end" title={item.username}>
                    {item.username}
                  </Text>
                  <Text size="xs" c="dimmed">
                    拉黑于 {formatDateTime(item.create_time)}
                  </Text>
                </Box>
              </Group>

              <Button
                size="compact-xs"
                variant="default"
                leftSection={<IconShieldOff size={12} />}
                loading={pendingUnblockId === item.user_id}
                onClick={() => unblock(item.user_id, item.username)}
              >
                解除拉黑
              </Button>
            </Group>
          </Card>
        ))}

        {totalPages > 1 && (
          <Group justify="center" mt="xs">
            <Pagination value={currentPage} onChange={setPage} total={totalPages} size="xs" />
          </Group>
        )}
      </Stack>
    );
  };

  return (
    <Modal.Root size="md" opened={blocksOpened} onClose={closeBlocks} fullScreen={small} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            <Group gap="xs">
              <IconShield size={18} />
              <Text fw={700}>黑名单管理</Text>
              <Badge size="xs" variant="light" color="gray">
                {total}
              </Badge>
            </Group>
          </Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>

        <Modal.Body>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              被加入黑名单的用户无法向你发送好友申请，也无法查看你的好友数据。
            </Text>

            {renderList()}

            <Group justify="flex-end" mt="md">
              <Button variant="default" size="xs" onClick={closeBlocks}>
                关闭
              </Button>
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
