import { ReactNode, useEffect, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconCalendar,
  IconCheck,
  IconDotsVertical,
  IconInbox,
  IconMailForward,
  IconSend,
  IconShield,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { EmptyState } from "@/components/EmptyState";
import { Link } from "@/components/Link";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ResponsivePagination } from "@/components/ResponsivePagination";
import profileClasses from "@/components/Profile/Profile.module.css";
import { useFriendRequests, useFriendRequestCounts } from "@/hooks/queries/useFriends";
import { useUser } from "@/hooks/queries/useUser";
import { useFriendRelationActions } from "@/hooks/useFriendRelationActions";
import useFriendStore from "@/hooks/useFriendStore";
import useGame from "@/hooks/useGame";
import { FriendRequestItem } from "@/types/friend";
import { getFriendLoadErrorMessage, MAX_OUTGOING_FRIEND_REQUESTS } from "@/utils/api/friend";
import { profilePath } from "@/utils/profile";
import { AddFriendButton } from "./AddFriendButton";
import { GameAvatar, RatingBadge } from "./FriendCard";
import { LoadingBlock } from "./LoadingBlock";
import { UsernameCopy } from "./UsernameCopy";

dayjs.extend(relativeTime);

type Direction = "incoming" | "outgoing";

const PAGE_SIZE = 20;

const CenterLabel = ({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
}) => (
  <Group gap={6} wrap="nowrap" align="center" justify="center">
    {icon}
    <span>{label}</span>
    {count !== undefined && count > 0 && (
      <Badge size="xs" variant="default" circle>
        {count}
      </Badge>
    )}
  </Group>
);

const RequestIdentity = ({ request }: { request: FriendRequestItem }) => {
  const [game] = useGame();
  const setListSearch = useFriendStore((state) => state.setListSearch);
  const slot = request.games?.[game];
  const profile = slot?.state === "visible" ? slot.profile : undefined;
  const time = dayjs(request.create_time);
  const username = request.user.username;

  return (
    <Group gap="md" wrap="nowrap" flex={1} miw={0}>
      <GameAvatar game={game} profile={profile} size={40} radius="sm" />
      <Box flex={1} miw={0}>
        <Group gap={6} wrap="nowrap">
          <Anchor
            component={Link}
            to={profilePath(username, game)}
            onClick={() => setListSearch("?tab=requests")}
            fw={500}
            size="md"
            c="inherit"
            underline="hover"
            truncate="end"
            title={profile?.name ?? username}
            miw={0}
          >
            {profile?.name ?? username}
          </Anchor>
          {profile && <RatingBadge game={game} rating={profile.rating} />}
        </Group>
        <Flex wrap="wrap" columnGap="md" rowGap={2} mt={2}>
          {profile && (
            <Group gap={4} wrap="nowrap" miw={0}>
              <IconUser size={12} style={{ color: "var(--mantine-color-dimmed)" }} />
              <Text size="xs" c="dimmed" truncate="end">
                {username}
              </Text>
            </Group>
          )}
          <Group gap={4} wrap="nowrap">
            <IconCalendar size={12} style={{ color: "var(--mantine-color-dimmed)" }} />
            <Text size="xs" c="dimmed" title={time.format("YYYY-MM-DD HH:mm")}>
              {time.locale("zh-cn").fromNow()}
            </Text>
          </Group>
        </Flex>
      </Box>
    </Group>
  );
};

export const FriendRequests = () => {
  const { user } = useUser();
  const [direction, setDirection] = useState<Direction>("incoming");
  const [incomingPage, setIncomingPage] = useState(1);
  const [outgoingPage, setOutgoingPage] = useState(1);

  const counts = useFriendRequestCounts();
  const incomingQuery = useFriendRequests(
    "incoming",
    incomingPage,
    PAGE_SIZE,
    direction === "incoming",
  );
  const outgoingQuery = useFriendRequests(
    "outgoing",
    outgoingPage,
    PAGE_SIZE,
    direction === "outgoing",
  );
  const actions = useFriendRelationActions();

  const currentQuery = direction === "incoming" ? incomingQuery : outgoingQuery;
  const page = direction === "incoming" ? incomingPage : outgoingPage;
  const setPage = direction === "incoming" ? setIncomingPage : setOutgoingPage;

  const totalPages = Math.ceil(currentQuery.total / currentQuery.pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));

  // 处理掉末页的全部申请后退回仍有数据的末页，否则会停在空页且分页控件被隐藏。
  useEffect(() => {
    if (currentQuery.data && page > currentPage) setPage(currentPage);
  }, [currentQuery.data, page, currentPage, setPage]);

  const renderActions = (req: FriendRequestItem) => {
    if (direction === "outgoing") {
      return (
        <Button
          size="xs"
          color="gray"
          variant="subtle"
          leftSection={<IconArrowBackUp size={14} />}
          loading={actions.pendingWithdrawId === req.id}
          onClick={() => actions.withdraw(req.id, req.user.username)}
          style={{ flexShrink: 0 }}
        >
          撤回
        </Button>
      );
    }

    return (
      <Group gap={4} wrap="nowrap" justify="flex-end" style={{ flexShrink: 0 }}>
        <Button
          size="xs"
          leftSection={<IconCheck size={14} />}
          loading={actions.pendingAcceptId === req.id}
          onClick={() => actions.accept(req.id, req.user.username)}
        >
          同意
        </Button>
        <Button
          size="xs"
          color="gray"
          variant="subtle"
          leftSection={<IconX size={14} />}
          loading={actions.pendingRejectId === req.id}
          onClick={() => actions.reject(req.id, req.user.username)}
        >
          拒绝
        </Button>
        <Menu shadow="md" position="bottom-end">
          <Menu.Target>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              loading={actions.pendingBlockId === req.user.id}
              aria-label="更多操作"
            >
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              color="red"
              leftSection={<IconShield size={16} />}
              onClick={() => actions.rejectAndBlock(req.user.id, req.user.username)}
            >
              拒绝并加入黑名单
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    );
  };

  const renderList = () => {
    if (currentQuery.isLoading && !currentQuery.data) return <LoadingBlock />;

    if (currentQuery.error && !currentQuery.data) {
      return (
        <QueryErrorState
          title="好友申请加载失败"
          description={getFriendLoadErrorMessage(currentQuery.error)}
          onRetry={() => void currentQuery.refetch()}
        />
      );
    }

    if (currentQuery.requests.length === 0) {
      return (
        <EmptyState
          icon={
            direction === "incoming" ? (
              <IconInbox size={64} stroke={1.5} />
            ) : (
              <IconMailForward size={64} stroke={1.5} />
            )
          }
          title={direction === "incoming" ? "暂无收到的申请" : "暂无发出的申请"}
        />
      );
    }

    return (
      <>
        <Stack gap="sm">
          {currentQuery.requests.map((req) => (
            <Card key={req.id} withBorder radius="md" p="xs" className={profileClasses.card}>
              <Flex
                direction={direction === "incoming" ? { base: "column", xs: "row" } : "row"}
                align={direction === "incoming" ? { base: "stretch", xs: "center" } : "center"}
                justify="space-between"
                gap="xs"
              >
                <RequestIdentity request={req} />
                {renderActions(req)}
              </Flex>
            </Card>
          ))}
        </Stack>

        <ResponsivePagination
          total={totalPages}
          value={currentPage}
          onChange={setPage}
          hideWithOnePage
        />
      </>
    );
  };

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
                  count={counts.incoming}
                />
              ),
              value: "incoming",
            },
            {
              label: (
                <CenterLabel
                  icon={<IconSend size={14} />}
                  label="发出的申请"
                  count={counts.outgoing}
                />
              ),
              value: "outgoing",
            },
          ]}
        />

        <Box ml="auto">
          <AddFriendButton />
        </Box>
      </Group>

      <Group justify="space-between" gap="xs">
        {user?.name && <UsernameCopy username={user.name} size="xs" />}
        {direction === "outgoing" && counts.outgoing > 0 && (
          <Text size="xs" c={counts.outgoing >= MAX_OUTGOING_FRIEND_REQUESTS ? "orange" : "dimmed"}>
            共 {counts.outgoing} / {MAX_OUTGOING_FRIEND_REQUESTS} 个申请
          </Text>
        )}
      </Group>

      {renderList()}
    </Stack>
  );
};
