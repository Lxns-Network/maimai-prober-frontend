import { ReactNode, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Pagination,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconClock,
  IconInbox,
  IconMailForward,
  IconSend,
  IconShield,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { EmptyState } from "@/components/EmptyState";
import profileClasses from "@/components/Profile/Profile.module.css";
import {
  useAcceptFriendRequest,
  useRejectFriendRequest,
  useWithdrawFriendRequest,
} from "@/hooks/mutations/useFriendMutations";
import { useFriendRequests } from "@/hooks/queries/useFriends";
import { useUser } from "@/hooks/queries/useUser";
import useFriendStore from "@/hooks/useFriendStore";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { AddFriendButton } from "./AddFriendButton";
import { LoadingBlock } from "./LoadingBlock";
import { UsernameCopy } from "./UsernameCopy";

dayjs.extend(relativeTime);

type Direction = "incoming" | "outgoing";

const CenterLabel = ({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
}) => (
  <Group gap={6} wrap="nowrap" align="center">
    {icon}
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <Badge size="xs" variant="light" color="gray" circle>
        {count}
      </Badge>
    )}
  </Group>
);

export const FriendRequests = () => {
  const { user } = useUser();
  const [direction, setDirection] = useState<Direction>("incoming");
  const [incomingPage, setIncomingPage] = useState(1);
  const [outgoingPage, setOutgoingPage] = useState(1);
  const small = useMediaQuery("(max-width: 30rem)");
  const openBlocks = useFriendStore((state) => state.openBlocks);

  const incomingQuery = useFriendRequests("incoming", incomingPage, 20);
  const outgoingQuery = useFriendRequests("outgoing", outgoingPage, 20);

  const currentQuery = direction === "incoming" ? incomingQuery : outgoingQuery;
  const page = direction === "incoming" ? incomingPage : outgoingPage;
  const setPage = direction === "incoming" ? setIncomingPage : setOutgoingPage;

  const acceptMutation = useAcceptFriendRequest();
  const rejectMutation = useRejectFriendRequest();
  const withdrawMutation = useWithdrawFriendRequest();

  const handleAccept = (requestId: number, username: string) => {
    acceptMutation.mutate(
      { requestId },
      {
        onSuccess: () => {
          notifications.show({
            title: "已同意好友申请",
            message: `你已与「${username}」成为好友！`,
            color: "green",
          });
        },
        onError: (err) => {
          notifications.show({
            title: "操作失败",
            message: getFriendErrorMessage(err, "同意好友申请失败"),
            color: "red",
          });
        },
      },
    );
  };

  const handleReject = (requestId: number, username: string) => {
    rejectMutation.mutate(
      { requestId },
      {
        onSuccess: () => {
          notifications.show({
            title: "已拒绝申请",
            message: `已拒绝来自「${username}」的好友申请`,
            color: "green",
          });
        },
        onError: (err) => {
          notifications.show({
            title: "操作失败",
            message: getFriendErrorMessage(err, "拒绝好友申请失败"),
            color: "red",
          });
        },
      },
    );
  };

  const handleWithdraw = (requestId: number, username: string) => {
    withdrawMutation.mutate(
      { requestId },
      {
        onSuccess: () => {
          notifications.show({
            title: "已撤回申请",
            message: `已撤回发给「${username}」的好友申请`,
            color: "green",
          });
        },
        onError: (err) => {
          notifications.show({
            title: "操作失败",
            message: getFriendErrorMessage(err, "撤回好友申请失败"),
            color: "red",
          });
        },
      },
    );
  };

  const totalPages = Math.ceil(currentQuery.total / currentQuery.pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const showInitialLoading = currentQuery.isLoading && !currentQuery.data;

  const blockButton = small ? (
    <Tooltip label="黑名单管理">
      <ActionIcon variant="default" size="input-sm" aria-label="黑名单管理" onClick={openBlocks}>
        <IconShield size={18} />
      </ActionIcon>
    </Tooltip>
  ) : (
    <Button variant="default" leftSection={<IconShield size={20} />} onClick={openBlocks}>
      黑名单管理
    </Button>
  );

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <SegmentedControl
          value={direction}
          onChange={(val) => setDirection(val as Direction)}
          data={[
            {
              label: (
                <CenterLabel
                  icon={<IconInbox size={14} />}
                  label="收到的申请"
                  count={incomingQuery.total}
                />
              ),
              value: "incoming",
            },
            {
              label: (
                <CenterLabel
                  icon={<IconSend size={14} />}
                  label="发出的申请"
                  count={outgoingQuery.total}
                />
              ),
              value: "outgoing",
            },
          ]}
        />

        <Group gap="xs" wrap="nowrap">
          {blockButton}
          <AddFriendButton />
        </Group>
      </Group>

      {user?.name && <UsernameCopy username={user.name} />}

      {showInitialLoading ? (
        <LoadingBlock />
      ) : currentQuery.requests.length > 0 ? (
        <Stack gap="xs">
          <Stack gap="sm">
            {currentQuery.requests.map((req) => (
              <Card key={req.id} withBorder radius="md" p="md" className={profileClasses.card}>
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <ThemeIcon variant="light" color="gray" size="lg" radius="md">
                      <IconUser size={20} />
                    </ThemeIcon>

                    <Box style={{ minWidth: 0 }}>
                      <Text fw={600} size="sm" lineClamp={1} style={{ wordBreak: "break-word" }}>
                        {req.user.username}
                      </Text>
                      <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                        <IconClock size={12} color="gray" style={{ flexShrink: 0 }} />
                        <Text size="xs" c="dimmed" truncate>
                          {dayjs(req.created_time).locale("zh-cn").fromNow()} (
                          {dayjs(req.created_time).format("MM-DD HH:mm")})
                        </Text>
                      </Group>
                    </Box>
                  </Group>

                  {direction === "incoming" ? (
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Button
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        loading={
                          acceptMutation.isPending && acceptMutation.variables?.requestId === req.id
                        }
                        onClick={() => handleAccept(req.id, req.user.username)}
                      >
                        同意
                      </Button>
                      <Button
                        size="xs"
                        color="gray"
                        variant="subtle"
                        leftSection={<IconX size={14} />}
                        loading={
                          rejectMutation.isPending && rejectMutation.variables?.requestId === req.id
                        }
                        onClick={() => handleReject(req.id, req.user.username)}
                      >
                        拒绝
                      </Button>
                    </Group>
                  ) : (
                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Badge size="xs" variant="light" color="gray">
                        等待对方同意
                      </Badge>
                      <Tooltip label="撤回申请">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          loading={
                            withdrawMutation.isPending &&
                            withdrawMutation.variables?.requestId === req.id
                          }
                          onClick={() => handleWithdraw(req.id, req.user.username)}
                          aria-label="撤回申请"
                        >
                          <IconTrash size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>

          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination value={currentPage} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </Stack>
      ) : (
        <EmptyState
          icon={
            direction === "incoming" ? (
              <IconInbox size={64} stroke={1.5} />
            ) : (
              <IconMailForward size={64} stroke={1.5} />
            )
          }
          title={direction === "incoming" ? "暂无收到的好友申请" : "暂无发出的好友申请"}
          description={
            direction === "incoming"
              ? "当其他用户搜索你的用户名并向你发送申请时，将显示在这里"
              : "点击上方「添加好友」输入对方用户名，发送好友申请"
          }
        />
      )}
    </Stack>
  );
};
