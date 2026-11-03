import { Box, Button, Card, DataList, Group, Stack, Text } from "@mantine/core";
import { IconLink, IconPhoto, IconTrash, IconUserOff } from "@tabler/icons-react";
import { PlayerCard } from "@/components/Profile/PlayerPanel/PlayerCard";
import { PlayerPanelSkeleton } from "@/components/Profile/PlayerPanel/Skeleton";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection";
import profileClasses from "@/components/Profile/Profile.module.css";
import { EmptyState } from "@/components/EmptyState";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import { useUser } from "@/hooks/queries/useUser";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame";
import { formatDateTime } from "@/utils/time";
import { GAME_NAMES } from "./gameNames";
import { UsernameCopy } from "./UsernameCopy";
import { UserAvatar } from "./UserAvatar";
import { useFileDialog } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteUserAvatar, useUploadUserAvatar } from "@/hooks/mutations/useUserMutations";
import { openAlertModal, openConfirmModal } from "@/utils/modal";
import { getFriendErrorMessage } from "@/utils/api/friend";

const InviteCard = ({ username }: { username: string }) => (
  <Card className={profileClasses.card} withBorder radius="md" p="md">
    <Group gap={8} wrap="nowrap" mb={4}>
      <IconLink size={18} />
      <Text fw={600} size="sm">
        邀请好友
      </Text>
    </Group>
    <Text size="xs" c="dimmed" mb="sm">
      分享好友链接，对方登录后打开即可向你发送申请。
    </Text>
    <UsernameCopy username={username} />
  </Card>
);

export const MyProfileCardSection = () => {
  const [game] = useGame();
  const { user, setData: setUser } = useUser();
  const queryClient = useQueryClient();
  const { player, isLoading } = usePlayer(game);
  const { scores } = useScores(game);

  const gameName = GAME_NAMES[game];
  const invite = user?.name ? <InviteCard username={user.name} /> : null;
  const uploadAvatar = useUploadUserAvatar();
  const deleteAvatar = useDeleteUserAvatar();
  const invalidateComments = () =>
    void queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        /^user\/(maimai|chunithm)\/comment\/list\?/.test(query.queryKey[0]),
    });
  const avatarDialog = useFileDialog({
    multiple: false,
    accept: "image/jpeg,image/png,image/webp",
    onChange: (files) => {
      const file = files?.[0];
      if (!file || !user) return;
      uploadAvatar.mutate(file, {
        onSuccess: (data) => {
          if (user) setUser({ ...user, avatar_url: data.avatar_url });
          invalidateComments();
        },
        onError: (error) => openAlertModal("头像上传失败", getFriendErrorMessage(error)),
      });
    },
  });

  const clearAvatar = () => {
    if (!user?.avatar_url) return;
    openConfirmModal("删除头像", "确定要删除自定义头像并恢复默认头像吗？", () =>
      deleteAvatar.mutate(undefined, {
        onSuccess: () => {
          if (user) setUser({ ...user, avatar_url: undefined });
          invalidateComments();
        },
        onError: (error) => openAlertModal("删除头像失败", getFriendErrorMessage(error)),
      }),
    );
  };

  if (isLoading) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p={0}>
        <PlayerPanelSkeleton />
      </Card>
    );
  }

  const avatarCard = (
    <Card className={profileClasses.card} withBorder radius="md" p="md">
      <Group justify="space-between" gap="sm">
        <Group gap="sm" wrap="nowrap" miw={0} flex="1 1 220px">
          <UserAvatar username={user?.name ?? "用户"} avatarUrl={user?.avatar_url} size={56} />
          <Box miw={0}>
            <Text fw={600}>站点头像</Text>
            <Text size="xs" c="dimmed">
              对所有登录用户公开；每天最多上传 3 次
            </Text>
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap" ml="auto">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPhoto size={14} />}
            loading={uploadAvatar.isPending}
            onClick={() => avatarDialog.open()}
          >
            {user?.avatar_url ? "更换" : "上传"}
          </Button>
          {user?.avatar_url && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              loading={deleteAvatar.isPending}
              onClick={clearAvatar}
            >
              删除
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  );

  if (!player) {
    return (
      <Stack gap="md">
        {avatarCard}
        <Card className={profileClasses.card} withBorder radius="md" p="md">
          <EmptyState
            icon={<IconUserOff size={64} stroke={1.5} />}
            title={`尚未绑定「${gameName}」`}
            description="绑定并同步游戏数据后即可展示名片"
          />
        </Card>
        {invite}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {avatarCard}
      <PlayerCard player={player}>
        <DataList.Item>
          <DataList.ItemLabel>上次同步时间</DataList.ItemLabel>
          <DataList.ItemValue>
            <Text fz="sm">{formatDateTime(player.upload_time)}</Text>
          </DataList.ItemValue>
        </DataList.Item>
      </PlayerCard>

      {scores.length > 0 &&
        (game === "maimai" ? (
          <MaimaiStatisticsSection
            scores={scores as MaimaiScoreProps[]}
            collapsible={false}
            className={profileClasses.card}
          />
        ) : (
          <ChunithmStatisticsSection
            scores={scores as ChunithmScoreProps[]}
            collapsible={false}
            className={profileClasses.card}
          />
        ))}

      {invite}
    </Stack>
  );
};
