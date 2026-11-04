import { Badge, Group } from "@mantine/core";
import { Page } from "@/components/Page/Page";
import { FriendsListSection } from "@/components/Friends/FriendsListSection";
import { FriendRequests } from "@/components/Friends/FriendRequests";
import { AddFriendModal } from "@/components/Friends/AddFriendModal";
import { BlockedUsersModal } from "@/components/Friends/BlockedUsersModal";
import { useFriendRequestCounts } from "@/hooks/queries/useFriends";

const PendingRequestsTabLabel = ({ count }: { count: number }) => (
  <Group gap="xs" wrap="nowrap">
    <span>好友申请</span>
    {count > 0 && (
      <Badge size="sm" circle color="red">
        {count > 99 ? "99+" : count}
      </Badge>
    )}
  </Group>
);

export default function Friends() {
  const { incoming: pendingIncomingCount } = useFriendRequestCounts();

  return (
    <>
      <Page
        meta={{
          title: "好友",
          description: "查看好友列表，管理你的「舞萌 DX」与「中二节奏」游戏好友",
        }}
        badge={<Badge variant="light">测试版</Badge>}
        tabs={[
          {
            id: "friends",
            name: "我的好友",
            children: <FriendsListSection />,
          },
          {
            id: "requests",
            name: <PendingRequestsTabLabel count={pendingIncomingCount} />,
            children: <FriendRequests />,
          },
        ]}
      />

      <AddFriendModal />
      <BlockedUsersModal />
    </>
  );
}
