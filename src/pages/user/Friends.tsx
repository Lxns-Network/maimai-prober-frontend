import { Badge, Group } from "@mantine/core";
import { Page } from "@/components/Page/Page";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { FriendsListSection } from "@/components/Friends/FriendsListSection";
import { FriendRequests } from "@/components/Friends/FriendRequests";
import { AddFriendModal } from "@/components/Friends/AddFriendModal";
import { BlockedUsersModal } from "@/components/Friends/BlockedUsersModal";
import { useFriendRequestCounts } from "@/hooks/queries/useFriends";
import { friendsTabs } from "./friendsTabs.ts";

const PendingRequestsTabLabel = ({ name, count }: { name: string; count: number }) => (
  <Group gap="xs" wrap="nowrap">
    <span>{name}</span>
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
          description: "管理你的「舞萌 DX」与「中二节奏」游戏好友",
        }}
        badge={<Badge variant="light">测试版</Badge>}
        tabs={withTabContent(friendsTabs, {
          friends: <FriendsListSection />,
          requests: <FriendRequests />,
        }).map((tab) =>
          tab.id === "requests"
            ? {
                ...tab,
                name: <PendingRequestsTabLabel name={tab.name} count={pendingIncomingCount} />,
              }
            : tab,
        )}
      />

      <AddFriendModal />
      <BlockedUsersModal />
    </>
  );
}
