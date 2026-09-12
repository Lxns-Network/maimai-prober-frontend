import { Anchor, Box, Card, DataList, Group, Stack, Text, Title } from "@mantine/core";
import { IconEye, IconEyeOff, IconUserOff } from "@tabler/icons-react";
import { Link } from "@/components/Link";
import { PlayerCard } from "@/components/Profile/PlayerPanel/PlayerCard";
import { PlayerPanelSkeleton } from "@/components/Profile/PlayerPanel/Skeleton";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection";
import profileClasses from "@/components/Profile/Profile.module.css";
import { EmptyState } from "@/components/EmptyState";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import { useUserConfig } from "@/hooks/queries/useUserConfig";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame";
import { formatDateTime } from "@/utils/time";
import { GAME_NAMES } from "./gameNames";

/**
 * 好友视角下的自己：与好友详情共用同一张游戏内名片，
 * 下方补上这张名片说明不了的概览数据与成绩达成情况。
 */
export const MyProfileCardSection = () => {
  const [game] = useGame();
  const { player, isLoading } = usePlayer(game);
  const { scores } = useScores(game);
  const { config } = useUserConfig(game);

  const gameName = GAME_NAMES[game];
  const scoresVisible = config?.allow_friend_fetch_scores ?? true;

  if (isLoading) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p={0}>
        <PlayerPanelSkeleton />
      </Card>
    );
  }

  if (!player) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <EmptyState
          icon={<IconUserOff size={64} stroke={1.5} />}
          title={`尚未绑定${gameName}`}
          description={`绑定并同步${gameName}数据后，好友就能看到你的名片`}
        />
      </Card>
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

      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <Group gap={8} wrap="nowrap" mb={4}>
          {scoresVisible ? <IconEye size={18} /> : <IconEyeOff size={18} />}
          <Text fw={600} size="sm">
            {scoresVisible ? "好友可以查看你的谱面成绩" : "好友无法查看你的谱面成绩"}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          昵称、头像、称号与评分等基本资料对好友始终可见。成绩可见性可在
          <Anchor component={Link} to="/user/settings?tab=general" size="xs" ml={4}>
            账号设置
          </Anchor>
          中调整。
        </Text>
      </Card>
    </Stack>
  );
};
