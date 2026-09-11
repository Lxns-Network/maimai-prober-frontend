import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Pagination,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconShield, IconTrash, IconUser, IconUserX } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { EmptyState } from "@/components/EmptyState";
import profileClasses from "@/components/Profile/Profile.module.css";
import { useUnblockUser } from "@/hooks/mutations/useFriendMutations";
import { useBlockedUsers } from "@/hooks/queries/useFriends";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import useFriendStore from "@/hooks/useFriendStore";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { openConfirmModal } from "@/utils/modal";
import { formatDateTime } from "@/utils/time";
import { LoadingBlock } from "./LoadingBlock";

export const BlockedUsersModal = () => {
  const { blocksOpened, closeBlocks } = useFriendStore();
  const small = useMediaQuery("(max-width: 30rem)");
  const [page, setPage] = useState(1);

  useBackDismiss(blocksOpened, closeBlocks);

  const { blocks, total, pageSize, isLoading } = useBlockedUsers(page, 20);
  const unblockMutation = useUnblockUser();

  const handleUnblock = (userId: number, username: string) => {
    openConfirmModal(
      "解除拉黑",
      `确定要将「${username}」从黑名单中移除吗？移除后对方可再次向你发送好友申请。`,
      () => {
        unblockMutation.mutate(
          { userId },
          {
            onSuccess: () => {
              notifications.show({
                title: "已解除拉黑",
                message: `已将「${username}」从黑名单中移除`,
                color: "green",
              });
            },
            onError: (err) => {
              notifications.show({
                title: "操作失败",
                message: getFriendErrorMessage(err, "解除拉黑失败"),
                color: "red",
              });
            },
          },
        );
      },
      {
        labels: { confirm: "解除拉黑", cancel: "取消" },
      },
    );
  };

  const totalPages = Math.ceil(total / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));

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

            {isLoading ? (
              <LoadingBlock />
            ) : blocks.length > 0 ? (
              <Stack gap="xs">
                <SimpleGrid cols={1} spacing="xs">
                  {blocks.map((item) => (
                    <Card
                      key={item.user_id}
                      withBorder
                      radius="md"
                      p="xs"
                      className={profileClasses.card}
                    >
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                          <ThemeIcon variant="light" color="gray" size="md" radius="md">
                            <IconUser size={16} />
                          </ThemeIcon>
                          <div style={{ minWidth: 0 }}>
                            <Text
                              fw={600}
                              size="sm"
                              lineClamp={1}
                              style={{ wordBreak: "break-word" }}
                            >
                              {item.username}
                            </Text>
                            <Text size="xs" c="dimmed">
                              拉黑于 {formatDateTime(item.created_time)}
                            </Text>
                          </div>
                        </Group>

                        <Tooltip label="解除拉黑">
                          <Button
                            size="compact-xs"
                            variant="default"
                            leftSection={<IconTrash size={12} />}
                            loading={
                              unblockMutation.isPending &&
                              unblockMutation.variables?.userId === item.user_id
                            }
                            onClick={() => handleUnblock(item.user_id, item.username)}
                          >
                            解除
                          </Button>
                        </Tooltip>
                      </Group>
                    </Card>
                  ))}
                </SimpleGrid>

                {totalPages > 1 && (
                  <Group justify="center" mt="xs">
                    <Pagination
                      value={currentPage}
                      onChange={setPage}
                      total={totalPages}
                      size="xs"
                    />
                  </Group>
                )}
              </Stack>
            ) : (
              <EmptyState
                icon={<IconUserX size={48} stroke={1.5} />}
                title="黑名单为空"
                description="你目前没有拉黑任何用户"
              />
            )}

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
