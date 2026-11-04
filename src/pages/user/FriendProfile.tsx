import { ReactNode, useMemo } from "react";
import { Button, Card, DataList, Group, Skeleton, Stack, Switch, Text } from "@mantine/core";
import {
  IconArrowBackUp,
  IconCheck,
  IconDatabaseOff,
  IconEyeOff,
  IconPencil,
  IconShieldOff,
  IconUserOff,
  IconUserPlus,
  IconUserSearch,
  IconX,
} from "@tabler/icons-react";
import { useLocalStorage } from "@mantine/hooks";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";
import { Page } from "@/components/Page/Page";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ScoreList } from "@/components/Scores/ScoreList";
import { PlayerCard, type PlayerCardFields } from "@/components/Profile/PlayerPanel/PlayerCard";
import profileClasses from "@/components/Profile/Profile.module.css";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection";
import { GAME_NAMES } from "@/components/Friends/gameNames";
import { LoadingBlock } from "@/components/Friends/LoadingBlock";
import { FriendActionButtons } from "@/components/Friends/FriendActionButtons";
import { FriendScoreComparison } from "@/components/Friends/FriendScoreComparison";
import { MyScoreGap } from "@/components/Friends/MyScoreGap";
import { useSendFriendRequest } from "@/hooks/useSendFriendRequest";
import { useFriendRelationActions } from "@/hooks/useFriendRelationActions";
import useFriendStore from "@/hooks/useFriendStore";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import { BestsGroup } from "@/pages/user/Scores/bests/ScoreBestsSection";
import { useFriendRelationship } from "@/hooks/queries/useFriends";
import { useFriendBests, useFriendRecents, useFriendScores } from "@/hooks/queries/useFriendScores";
import { formatDateTime } from "@/utils/time";
import { getFriendLoadErrorMessage } from "@/utils/api/friend";
import { APIError } from "@/utils/errors";
import { chartKey, indexByChart } from "@/utils/scoreCompare";
import { FriendRelationship, ProfileSlot } from "@/types/friend";
import { Game } from "@/types/game";
import {
  ChunithmBestsProps,
  ChunithmScoreProps,
  MaimaiBestsProps,
  MaimaiScoreProps,
} from "@/types/score";
import useGame from "@/hooks/useGame";
import { UserAvatar } from "@/components/Friends/UserAvatar";

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

const SlotEmptyState = ({
  state,
  gameName,
  children,
}: {
  state: ProfileSlot["state"];
  gameName: string;
  children?: ReactNode;
}) => (
  <EmptyState
    icon={
      state === "private" ? (
        <IconEyeOff size={64} stroke={1.5} />
      ) : (
        <IconUserOff size={64} stroke={1.5} />
      )
    }
    title={
      state === "private"
        ? "该用户未公开档案"
        : state === "unbound"
          ? `尚未绑定「${gameName}」`
          : `「${gameName}」暂无游戏数据`
    }
  >
    {children}
  </EmptyState>
);

const GameCard = ({ slot, friend }: { slot: ProfileSlot; friend: FriendRelationship }) => {
  const [game, setGame] = useGame();
  const gameName = GAME_NAMES[game];
  const otherGame: Game = game === "maimai" ? "chunithm" : "maimai";
  const visible = slot.state === "visible" && !!slot.profile;

  if (!visible) {
    return (
      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <SlotEmptyState state={slot.state} gameName={gameName}>
          {friend.games[otherGame].state === "visible" && (
            <Button variant="light" size="xs" mt="xs" onClick={() => setGame(otherGame)}>
              切换到「{GAME_NAMES[otherGame]}」查看
            </Button>
          )}
        </SlotEmptyState>
      </Card>
    );
  }

  return (
    <PlayerCard player={slot.profile as PlayerCardFields}>
      {friend.friends_since && (
        <DataList.Item>
          <DataList.ItemLabel>成为好友时间</DataList.ItemLabel>
          <DataList.ItemValue>
            <Text fz="sm">{formatDateTime(friend.friends_since)}</Text>
          </DataList.ItemValue>
        </DataList.Item>
      )}
      <DataList.Item>
        <DataList.ItemLabel>上次同步时间</DataList.ItemLabel>
        <DataList.ItemValue>
          <Text fz="sm">{formatDateTime(slot.profile?.upload_time)}</Text>
        </DataList.ItemValue>
      </DataList.Item>
    </PlayerCard>
  );
};

const ScoresLoadError = ({ error, onRetry }: { error: unknown; onRetry: () => void }) => (
  <QueryErrorState
    title="成绩加载失败"
    description={getFriendLoadErrorMessage(error)}
    onRetry={onRetry}
  />
);

type FriendBests = MaimaiBestsProps | ChunithmBestsProps;

const BestsGroups = ({
  bests,
  renderFooter,
}: {
  bests: FriendBests;
  renderFooter?: (score: AnyScore) => ReactNode;
}) => {
  const groups: { title: string; subtitle: string; scores: AnyScore[] }[] =
    "dx" in bests
      ? [
          { title: "Best 15", subtitle: "现版本最佳曲目", scores: bests.dx },
          { title: "Best 35", subtitle: "旧版本最佳曲目", scores: bests.standard },
        ]
      : [
          { title: "Best 30", subtitle: "评分对象曲（最高）", scores: bests.bests },
          { title: "Selection 10", subtitle: "候选评分对象曲（最高）", scores: bests.selections },
          { title: "New 20", subtitle: "评分对象曲（新曲）", scores: bests.new_bests },
        ];

  return groups.map((group) => (
    <BestsGroup key={group.title} {...group} readOnly renderFooter={renderFooter} />
  ));
};

const ComparedBestsGroups = ({ bests }: { bests: FriendBests }) => {
  const [game] = useGame();
  const { scores: myScores } = useScores(game);
  const myScoreByChart = useMemo(() => indexByChart(myScores as AnyScore[]), [myScores]);

  return (
    <BestsGroups
      bests={bests}
      renderFooter={(score) => (
        <MyScoreGap game={game} mine={myScoreByChart.get(chartKey(score))} theirs={score} />
      )}
    />
  );
};

const BestsTab = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();
  const { bests, isLoading, error, refetch } = useFriendBests(friend.user_id, game);
  const { player } = usePlayer(game);
  const [compare, setCompare] = useLocalStorage({
    key: "friend_bests_compare",
    defaultValue: false,
  });

  if (isLoading) return <LoadingBlock />;
  if (error) return <ScoresLoadError error={error} onRetry={() => void refetch()} />;
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
      {player && friend.status !== "self" && (
        <Switch
          label="显示我的成绩"
          checked={compare}
          onChange={(event) => setCompare(event.currentTarget.checked)}
        />
      )}
      {compare && player && friend.status !== "self" ? (
        <ComparedBestsGroups bests={bests} />
      ) : (
        <BestsGroups bests={bests} />
      )}
    </Stack>
  );
};

const RecentsTab = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();
  const { recents, isLoading, error, refetch } = useFriendRecents(friend.user_id, game);

  if (isLoading) return <LoadingBlock />;
  if (error) {
    return <ScoresLoadError error={error} onRetry={() => void refetch()} />;
  }

  if (recents.length === 0) {
    return (
      <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="暂无最近游玩记录" />
    );
  }

  return <ScoreList scores={recents} readOnly />;
};

/** 统计与对比共用对方的全部成绩；两者都挂载时 TanStack Query 只请求一次。 */
const FriendScoresGate = ({
  friend,
  children,
}: {
  friend: FriendRelationship;
  children: (scores: AnyScore[]) => ReactNode;
}) => {
  const [game] = useGame();
  const { scores, isLoading, error, refetch } = useFriendScores(friend.user_id, game);

  if (isLoading) return <LoadingBlock />;
  if (error) {
    return <ScoresLoadError error={error} onRetry={() => void refetch()} />;
  }
  if (scores.length === 0) {
    return <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="暂无成绩数据" />;
  }
  return children(scores);
};

const StatisticsTab = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();

  return (
    <FriendScoresGate friend={friend}>
      {(scores) =>
        game === "maimai" ? (
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
        )
      }
    </FriendScoresGate>
  );
};

const CompareTab = ({ friend }: { friend: FriendRelationship }) => (
  <FriendScoresGate friend={friend}>
    {(scores) => <FriendScoreComparison friend={friend} theirScores={scores} />}
  </FriendScoresGate>
);

const ProfileTab = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();
  const slot = friend.games[game];

  return (
    <Stack gap="md">
      <GameCard slot={slot} friend={friend} />
      {(friend.status === "friend" || friend.status === "self") &&
        slot.state === "visible" &&
        slot.profile && <StatisticsTab friend={friend} />}
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

const ProfileActions = ({ profile }: { profile: FriendRelationship }) => {
  const { send, isPending } = useSendFriendRequest();
  const actions = useFriendRelationActions();
  const { username, request_id: requestId } = profile;

  if (profile.status === "friend") return <FriendActionButtons friend={profile} />;
  if (profile.status === "self") {
    return (
      <Button
        variant="default"
        leftSection={<IconPencil size={16} />}
        onClick={() => void navigate("/user/profile")}
      >
        编辑资料
      </Button>
    );
  }
  if (profile.status === "incoming" && requestId) {
    return (
      <Group gap="xs">
        <Button
          variant="default"
          leftSection={<IconX size={16} />}
          loading={actions.pendingRejectId === requestId}
          onClick={() => actions.reject(requestId, username)}
        >
          拒绝
        </Button>
        <Button
          leftSection={<IconCheck size={16} />}
          loading={actions.pendingAcceptId === requestId}
          onClick={() => actions.accept(requestId, username)}
        >
          同意申请
        </Button>
      </Group>
    );
  }
  if (profile.status === "outgoing" && requestId) {
    return (
      <Button
        variant="default"
        leftSection={<IconArrowBackUp size={16} />}
        loading={actions.pendingWithdrawId === requestId}
        onClick={() => actions.withdraw(requestId, username)}
      >
        撤回申请
      </Button>
    );
  }
  if (profile.status === "blocked") {
    return (
      <Button
        variant="light"
        leftSection={<IconShieldOff size={16} />}
        loading={actions.pendingUnblockId === profile.user_id}
        onClick={() => actions.unblock(profile.user_id, username)}
      >
        解除拉黑
      </Button>
    );
  }
  return (
    <Button
      leftSection={<IconUserPlus size={16} />}
      loading={isPending}
      onClick={() => send(username)}
    >
      发送好友申请
    </Button>
  );
};

export default function FriendProfile() {
  const pageContext = usePageContext();
  const username = String(pageContext.routeParams?.username ?? "") || getUsernameFromPathname();
  const { relationship: profile, isLoading, error, refetch } = useFriendRelationship(username);
  const listSearch = useFriendStore((state) => state.listSearch);
  const [game] = useGame();
  const isSelf = profile?.status === "self";
  const accessible = !!profile && !error && profile.status !== "blocked";
  const showFriendTabs =
    (profile?.status === "friend" || isSelf) && profile?.games[game].state === "visible";
  const profileContent = profile && <ProfileTab friend={profile} />;

  const fallback = () => {
    if (!username) return <EmptyState title="链接中缺少用户名" />;
    if (isLoading) return <LoadingBlock />;
    if (error instanceof APIError && error.status === 404)
      return <EmptyState icon={<IconUserSearch size={64} stroke={1.5} />} title="找不到该用户" />;
    if (error || !profile)
      return (
        <QueryErrorState
          title="档案加载失败"
          description={getFriendLoadErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      );
    return <EmptyState icon={<IconEyeOff size={64} stroke={1.5} />} title="TA 在你的黑名单中" />;
  };

  return (
    <Page
      meta={{
        title: isLoading ? "用户档案" : profile?.remark || profile?.username || username,
        description: profile?.remark ? `@${profile.username}` : "用户档案",
      }}
      backLink={
        isSelf
          ? undefined
          : {
              to: `/friends${listSearch || "?tab=friends"}`,
              label:
                new URLSearchParams(listSearch).get("tab") === "requests"
                  ? "返回好友申请"
                  : "返回好友列表",
            }
      }
      actions={profile && !error ? <ProfileActions profile={profile} /> : undefined}
      avatar={
        isLoading ? (
          <Skeleton circle h={96} w={96} />
        ) : (
          <UserAvatar
            username={profile?.username ?? username}
            avatarUrl={accessible ? profile?.avatar_url : undefined}
            size={96}
          />
        )
      }
      tabs={
        accessible && showFriendTabs
          ? [
              { id: "profile", name: "资料", children: profileContent },
              { id: "bests", name: "最佳成绩", children: <BestsTab key={game} friend={profile} /> },
              {
                id: "recents",
                name: "最近游玩",
                children: <RecentsTab key={game} friend={profile} />,
              },
              ...(isSelf
                ? []
                : [
                    {
                      id: "compare",
                      name: "好友 VS",
                      children: <CompareTab key={game} friend={profile} />,
                    },
                  ]),
            ]
          : undefined
      }
    >
      {!accessible ? fallback() : showFriendTabs ? undefined : profileContent}
    </Page>
  );
}
