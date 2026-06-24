import { useState } from "react";
import {
  Accordion,
  Button,
  EmptyState,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { IconChecks } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Page } from "@/components/Page/Page.tsx";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";
import { NotificationTypeIcon } from "@/components/Notifications/NotificationTypeIcon.tsx";
import { getNotificationDisplay } from "@/components/Notifications/notificationTemplates.tsx";
import { useNotifications } from "@/hooks/queries/useNotifications.ts";
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/mutations/useNotificationMutations.ts";
import { useNotificationAction } from "@/hooks/useNotificationAction.ts";

dayjs.extend(relativeTime);

const PAGE_SIZE = 20;

function NotificationFeed() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [openedItems, setOpenedItems] = useState<string[]>([]);
  const { data, isLoading } = useNotifications({ filter, page, pageSize: PAGE_SIZE });
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAll } = useMarkAllNotificationsRead();
  const dispatch = useNotificationAction();

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const handleFilterChange = (value: string) => {
    setFilter(value as "all" | "unread");
    setPage(1);
    setOpenedItems([]);
  };

  const handlePageChange = (value: number) => {
    setPage(value);
    setOpenedItems([]);
  };

  const handleOpenChange = (values: string[]) => {
    values
      .filter((v) => !openedItems.includes(v))
      .forEach((key) => {
        const n = data?.notifications.find((x) => `${x.category}-${x.id}` === key);
        if (n && !n.read) markRead({ category: n.category, id: n.id });
      });
    setOpenedItems(values);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <SegmentedControl
          value={filter}
          onChange={handleFilterChange}
          data={[
            { label: "全部", value: "all" },
            { label: "未读", value: "unread" },
          ]}
        />
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconChecks size={16} />}
          onClick={() => markAll()}
        >
          全部标为已读
        </Button>
      </Group>

      {isLoading && (
        <Group justify="center">
          <Loader />
        </Group>
      )}

      {!isLoading && (data?.notifications.length ?? 0) === 0 && <EmptyState title="暂无通知" />}

      <Accordion variant="contained" multiple value={openedItems} onChange={handleOpenChange}>
        {data?.notifications.map((n) => {
          const key = `${n.category}-${n.id}`;
          const display = getNotificationDisplay(n);
          const action = display.action;
          return (
            <Accordion.Item key={key} value={key}>
              <Accordion.Control
                icon={<NotificationTypeIcon type={n.type} level={n.level} unread={!n.read} />}
              >
                <Group gap="xs" wrap="nowrap" justify="space-between">
                  <Text fw={n.read ? 500 : 700} size="sm">
                    {display.title}
                  </Text>
                  <Text c="dimmed" size="xs" mr="xs" style={{ whiteSpace: "nowrap" }}>
                    {dayjs(n.create_time).locale("zh-cn").fromNow()}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {display.body}
                {action && (
                  <Group justify="flex-end" mt="sm">
                    <Button size="xs" variant="light" onClick={() => void dispatch(action)}>
                      查看
                    </Button>
                  </Group>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>

      {totalPages > 1 && (
        <Group justify="center">
          <ResponsivePagination total={totalPages} value={page} onChange={handlePageChange} />
        </Group>
      )}
    </Stack>
  );
}

export default function Notifications() {
  return (
    <Page meta={{ title: "通知", description: "查看 maimai DX 查分器的系统通知与个人消息" }}>
      <NotificationFeed />
    </Page>
  );
}
