import { Badge, Group } from "@mantine/core";
import { Page } from "@/components/Page/Page";
import { FriendsListSection } from "@/components/Friends/FriendsListSection";
import { MyProfileCardSection } from "@/components/Friends/MyProfileCardSection";
import { FriendRequests } from "@/components/Friends/FriendRequests";
import { AddFriendModal } from "@/components/Friends/AddFriendModal";
import { BlockedUsersModal } from "@/components/Friends/BlockedUsersModal";
import { useFriendRequests } from "@/hooks/queries/useFriends";

/** 待处理申请是需要动作的信号，角标沿用侧栏未读通知的红色；好友总数不加角标。 */
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
  const { total: pendingIncomingCount } = useFriendRequests("incoming", 1, 20);

  return (
    <>
      <Page
        meta={{
          title: "好友",
          description: "查看好友列表，管理你的「舞萌 DX」与「中二节奏」游戏好友",
        }}
        tabs={[
          {
            id: "friends",
            name: "我的好友",
            children: <FriendsListSection />,
          },
          {
            id: "profile",
            name: "我的名片",
            children: <MyProfileCardSection />,
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
