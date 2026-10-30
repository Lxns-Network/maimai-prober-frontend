import { Box, Card, DataList, Group, Stack, Text, Title } from "@mantine/core";
import { IconLink, IconUserOff } from "@tabler/icons-react";
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

const InviteCard = ({ username }: { username: string }) => (
  <Card className={profileClasses.card} withBorder radius="md" p="md">
    <Group gap={8} wrap="nowrap" mb={4}>
      <IconLink size={18} />
      <Text fw={600} size="sm">
        邀请好友
      </Text>
    </Group>
    <Text size="xs" c="dimmed" mb="sm">
      把好友链接发给对方，对方登录后打开即可直接向你发送好友申请。
    </Text>
    <UsernameCopy username={username} />
  </Card>
);

/**
 * 好友视角下的自己：与好友详情共用同一张游戏内名片，
 * 下方补上这张名片说明不了的概览数据与成绩达成情况。
 */
export const MyProfileCardSection = () => {
  const [game] = useGame();
  const { user } = useUser();
  const { player, isLoading } = usePlayer(game);
  const { scores } = useScores(game);

  const gameName = GAME_NAMES[game];
  const invite = user?.name ? <InviteCard username={user.name} /> : null;

  if (isLoading) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p={0}>
        <PlayerPanelSkeleton />
      </Card>
    );
  }

  if (!player) {
    return (
      <Stack gap="md">
        <Card className={profileClasses.card} withBorder radius="md" p="md">
          <EmptyState
            icon={<IconUserOff size={64} stroke={1.5} />}
            title={`尚未绑定「${gameName}」`}
            description={`绑定并同步「${gameName}」数据后，好友就能看到你的名片`}
          />
        </Card>
        {invite}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <PlayerCard player={player}>
        <DataList.Item>
          <DataList.ItemLabel>上次同步时间</DataList.ItemLabel>
          <DataList.ItemValue>
            <Text fz="sm">{formatDateTime(player.upload_time)}</Text>
          </DataList.ItemValue>
        </DataList.Item>
      </PlayerCard>

      {scores.length > 0 && (
        <Box>
          <Title order={3} fz="md" mb="xs">
            成绩达成情况
          </Title>
          {game === "maimai" ? (
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
          )}
        </Box>
      )}

      {invite}
    </Stack>
  );
};
