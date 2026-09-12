import {
  ActionIcon,
  Button,
  Card,
  DataList,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconDatabaseOff,
  IconDotsVertical,
  IconEdit,
  IconEyeOff,
  IconShield,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUserOff,
  IconUserPlus,
} from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";
import { Page } from "@/components/Page/Page";
import { EmptyState } from "@/components/EmptyState";
import { ScoreList } from "@/components/Scores/ScoreList";
import { PlayerCard, type PlayerCardFields } from "@/components/Profile/PlayerPanel/PlayerCard";
import profileClasses from "@/components/Profile/Profile.module.css";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection";
import { GAME_NAMES } from "@/components/Friends/gameNames";
import { LoadingBlock } from "@/components/Friends/LoadingBlock";
import { useFriendActions } from "@/components/Friends/useFriendActions";
import { BestsGroup } from "@/pages/user/Scores/bests/ScoreBestsSection";
import { useFriends } from "@/hooks/queries/useFriends";
import { useFriendBests, useFriendRecents, useFriendScores } from "@/hooks/queries/useFriendScores";
import { formatDateTime } from "@/utils/time";
import { FriendItem, GameSlot } from "@/types/friend";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame";

/** 未绑定是客观状态，暂无数据是同步问题；「未公开」由 ScoresBlockedNotice 单独呈现，不在此处。 */
const SlotEmptyState = ({ state, gameName }: { state: GameSlot["state"]; gameName: string }) => (
  <EmptyState
    icon={<IconUserOff size={64} stroke={1.5} />}
    title={state === "unbound" ? `尚未绑定${gameName}` : `${gameName}暂无游戏数据`}
    description={
      state === "unbound"
        ? "该好友还没有在查分器绑定这个游戏"
        : "该好友绑定了游戏，但还没有同步过数据"
    }
  />
);

/** 名片本身与账号详情页共用，下方信息行补充这张名片表达不了的好友维度数据。 */
const GameCard = ({ slot, game, friend }: { slot: GameSlot; game: Game; friend: FriendItem }) => {
  const gameName = GAME_NAMES[game];
  const visible = slot.state === "visible" && !!slot.profile;

  if (!visible) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <SlotEmptyState state={slot.state} gameName={gameName} />
      </Card>
    );
  }

  return (
    <PlayerCard player={slot.profile as PlayerCardFields}>
      <DataList.Item>
        <DataList.ItemLabel>成为好友时间</DataList.ItemLabel>
        <DataList.ItemValue>
          <Text fz="sm">{formatDateTime(friend.friends_since)}</Text>
        </DataList.ItemValue>
      </DataList.Item>
      <DataList.Item>
        <DataList.ItemLabel>上次同步时间</DataList.ItemLabel>
        <DataList.ItemValue>
          <Text fz="sm">{formatDateTime(slot.profile?.upload_time)}</Text>
        </DataList.ItemValue>
      </DataList.Item>
    </PlayerCard>
  );
};

/** 成绩相关的 tab 共用同一份可见性判断：不可见时给出解释而不是空白。 */
const getFriendScoreAccess = (friend: FriendItem, game: Game) => {
  const slot = friend.games[game];
  return { slot, canView: slot.state === "visible" && slot.scores_visible };
};

/** 基本资料对好友始终可见，「未公开」只针对成绩，是对方在账号设置中的主动选择。 */
const ScoresBlockedNotice = ({ slot, gameName }: { slot: GameSlot; gameName: string }) => {
  if (slot.state !== "visible") {
    return <SlotEmptyState state={slot.state} gameName={gameName} />;
  }

  return (
    <Card className={profileClasses.card} withBorder radius="md" p="md">
      <Group gap={8} wrap="nowrap" mb={4}>
        <IconEyeOff size={18} />
        <Text fw={600} size="sm">
          TA 没有公开「{gameName}」的成绩
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        如果想看，可以让 TA 在「账号设置」中开启「允许好友查看谱面成绩」。
      </Text>
    </Card>
  );
};

const BestsTab = ({ friend }: { friend: FriendItem }) => {
  const [game] = useGame();
  const { slot, canView } = getFriendScoreAccess(friend, game);
  const { bests, isLoading } = useFriendBests(friend.user_id, game, canView);

  if (!canView) return <ScoresBlockedNotice slot={slot} gameName={GAME_NAMES[game]} />;
  if (isLoading) return <LoadingBlock />;
  if (!bests) {
    return (
      <EmptyState
        icon={<IconDatabaseOff size={64} stroke={1.5} />}
        title="没有获取到任何最佳成绩"
      />
    );
  }

  return (
    <Stack gap="lg">
      {"dx" in bests ? (
        <>
          <BestsGroup title="Best 15" subtitle="现版本最佳曲目" scores={bests.dx} readOnly />
          <BestsGroup title="Best 35" subtitle="旧版本最佳曲目" scores={bests.standard} readOnly />
        </>
      ) : (
        <>
          <BestsGroup title="Best 30" subtitle="评分对象曲（最高）" scores={bests.bests} readOnly />
          <BestsGroup
            title="Selection 10"
            subtitle="候选评分对象曲（最高）"
            scores={bests.selections}
            readOnly
          />
          <BestsGroup
            title="New 20"
            subtitle="评分对象曲（新曲）"
            scores={bests.new_bests}
            readOnly
          />
        </>
      )}
    </Stack>
  );
};

const RecentsTab = ({ friend }: { friend: FriendItem }) => {
  const [game] = useGame();
  const { slot, canView } = getFriendScoreAccess(friend, game);
  const { recents, isLoading } = useFriendRecents(friend.user_id, game, canView);

  if (!canView) return <ScoresBlockedNotice slot={slot} gameName={GAME_NAMES[game]} />;
  if (isLoading) return <LoadingBlock />;

  if (recents.length === 0) {
    return (
      <EmptyState
        icon={<IconDatabaseOff size={64} stroke={1.5} />}
        title="暂无最近游玩记录"
        description="只有通过「同步游戏数据」抓取的成绩才带游玩时间，第三方客户端上传的成绩不会出现在这里"
      />
    );
  }

  return <ScoreList scores={recents} readOnly />;
};

const StatisticsTab = ({ friend }: { friend: FriendItem }) => {
  const [game] = useGame();
  const { slot, canView } = getFriendScoreAccess(friend, game);
  const { scores, isLoading } = useFriendScores(friend.user_id, game, canView);

  if (!canView) return <ScoresBlockedNotice slot={slot} gameName={GAME_NAMES[game]} />;
  if (isLoading) return <LoadingBlock />;

  if (scores.length === 0) {
    return <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="暂无成绩数据" />;
  }

  return game === "maimai" ? (
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
  );
};

/**
 * 名片和成绩分布同属「这个人是谁」，合成一个 tab 竖向排布。
 * 游戏槽位不可用时只有一个空态，不再往下拼统计。
 */
const ProfileTab = ({ friend }: { friend: FriendItem }) => {
  const [game] = useGame();
  const slot = friend.games[game];

  if (slot.state !== "visible" || !slot.profile) {
    return <GameCard slot={slot} game={game} friend={friend} />;
  }

  return (
    <Stack gap="md">
      <GameCard slot={slot} game={game} friend={friend} />
      <StatisticsTab friend={friend} />
    </Stack>
  );
};

/**
 * `/profile/xxx` 走预渲染壳页时 `routeParams` 为空，此时从真实 pathname 里取用户名。
 * 与 Vike 的路由参数一致返回解码后的值；手输的畸形转义序列按空用户名处理而不抛错。
 */
const getUsernameFromPathname = () => {
  if (typeof window === "undefined") return "";
  const pathMatch = window.location.pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (!pathMatch) return "";
  try {
    return decodeURIComponent(pathMatch[1]);
  } catch {
    return "";
  }
};

const FriendActions = ({ friend }: { friend: FriendItem }) => {
  const { editRemark, toggleFavorite, remove, block } = useFriendActions(friend, {
    onRemoved: () => navigate("/friends"),
  });
  const favoriteLabel = friend.is_favorite ? "取消特别关注" : "设为特别关注";

  return (
    <>
      <Tooltip label={favoriteLabel}>
        <ActionIcon
          variant="default"
          color="gray"
          size="input-sm"
          onClick={toggleFavorite}
          aria-label={favoriteLabel}
        >
          {friend.is_favorite ? (
            <IconStarFilled size={18} style={{ color: "var(--mantine-color-yellow-6)" }} />
          ) : (
            <IconStar size={18} />
          )}
        </ActionIcon>
      </Tooltip>

      <Menu shadow="md" position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="default" size="input-sm" aria-label="好友操作">
            <IconDotsVertical size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconEdit size={16} />} onClick={editRemark}>
            修改备注
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconShield size={16} />} onClick={block}>
            加入黑名单
          </Menu.Item>
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={remove}>
            删除好友
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};

export default function FriendProfile() {
  const pageContext = usePageContext();
  const username = String(pageContext.routeParams?.username ?? "") || getUsernameFromPathname();
  const { friends, isLoading } = useFriends();
  const friend = friends.find((item) => item.username === username);

  const displayName = friend?.remark || friend?.username || username;
  const description = friend?.remark ? `@${friend.username}` : "好友资料";

  return (
    <Page
      meta={{ title: isLoading ? "好友资料" : displayName, description }}
      backLink={{ to: "/friends?tab=friends", label: "返回好友列表" }}
      actions={friend ? <FriendActions friend={friend} /> : undefined}
      tabs={
        friend
          ? [
              { id: "profile", name: "资料", children: <ProfileTab friend={friend} /> },
              { id: "bests", name: "最佳成绩", children: <BestsTab friend={friend} /> },
              { id: "recents", name: "最近游玩", children: <RecentsTab friend={friend} /> },
            ]
          : undefined
      }
    >
      {friend ? undefined : isLoading ? (
        <LoadingBlock />
      ) : (
        <EmptyState
          icon={<IconUserPlus size={64} stroke={1.5} />}
          title="你们还不是好友"
          description={`无法查看「${username}」的资料，可以先向对方发送好友申请`}
        >
          <Button mt="md" onClick={() => navigate("/friends")}>
            返回好友列表
          </Button>
        </EmptyState>
      )}
    </Page>
  );
}
