import { useState } from "react";
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Stack,
  Text,
  Tooltip,
  Typography,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import dayjs from "dayjs";
import { useAdminNotifications } from "@/hooks/queries/useAdminNotifications.ts";
import { useDeleteNotification } from "@/hooks/mutations/useAdminNotificationMutations.ts";
import { PublishNotificationModal } from "@/components/Notifications/PublishNotificationModal.tsx";
import { NotificationTypeIcon } from "@/components/Notifications/NotificationTypeIcon.tsx";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { AdminBroadcast } from "@/types/notification";

const PAGE_SIZE = 10;

const audienceLabel: Record<string, string> = {
  all: "全体",
  permission: "指定角色",
  users: "指定用户",
};

const isExpired = (b: AdminBroadcast) => !!b.expire_time && new Date(b.expire_time) < new Date();

export function AdminNotificationsSection() {
  const { broadcasts, isLoading } = useAdminNotifications();
  const { mutate: remove } = useDeleteNotification();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<AdminBroadcast | undefined>(undefined);
  const [page, setPage] = useState(1);
  const small = useMediaQuery("(max-width: 30rem)");

  const totalPages = Math.ceil(broadcasts.length / PAGE_SIZE);
  const pageItems = broadcasts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = (b: AdminBroadcast) =>
    openConfirmModal(
      "删除通知",
      "确定要删除这条通知吗？将永久删除，不可恢复。",
      () =>
        remove(b.id, {
          onError: (err) => openRetryModal("删除失败", `${err}`, () => handleDelete(b)),
        }),
      { confirmProps: { color: "red" } },
    );

  return (
    <Stack>
      <PublishNotificationModal
        opened={opened}
        onClose={() => {
          close();
          setEditing(undefined);
        }}
        editing={editing}
      />

      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(undefined);
            open();
          }}
        >
          发送通知
        </Button>
      </Group>

      {isLoading && (
        <Group justify="center">
          <Loader />
        </Group>
      )}

      {!isLoading && broadcasts.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          暂无通知
        </Text>
      )}

      <Accordion variant="contained">
        {pageItems.map((b) => (
          <Accordion.Item key={b.id} value={String(b.id)}>
            <Accordion.Control icon={<NotificationTypeIcon type={b.type} level={b.level} />}>
              <Group gap="xs">
                <Text
                  fw={600}
                  c={isExpired(b) ? "dimmed" : undefined}
                  td={isExpired(b) ? "line-through" : undefined}
                >
                  {b.title}
                </Text>
                <Badge variant="light" color="gray">
                  {audienceLabel[b.audience_type]}
                </Badge>
              </Group>
              <Text c="dimmed" size="xs" mt={4}>
                发布于 {dayjs(b.create_time).format("YYYY-MM-DD HH:mm")}
                {b.expire_time && ` · 过期于 ${dayjs(b.expire_time).format("YYYY-MM-DD HH:mm")}`}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Typography>
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {b.content}
                </Markdown>
              </Typography>
              <Group justify="flex-end" mt="sm" gap="xs">
                <Tooltip label="编辑" position="top" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setEditing(b);
                      open();
                    }}
                  >
                    <IconEdit size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="删除" position="top" withArrow>
                  <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(b)}>
                    <IconTrash size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      {totalPages > 1 && (
        <Group justify="center">
          <Pagination
            total={totalPages}
            value={page}
            onChange={setPage}
            size={small ? "sm" : "md"}
          />
        </Group>
      )}
    </Stack>
  );
}
