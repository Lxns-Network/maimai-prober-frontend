import { ReactNode, useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  DataList,
  Group,
  Modal,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconCheck,
  IconDatabaseOff,
  IconEdit,
  IconEyeOff,
  IconShieldOff,
  IconUserOff,
  IconUserPlus,
  IconUserSearch,
  IconX,
} from "@tabler/icons-react";
import { useDisclosure, useFileDialog, useLocalStorage } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";
import { Page } from "@/components/Page/Page";
import { EditAvatarButton } from "@/components/EditAvatarButton";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { AvatarCropModal } from "@/components/Profile/AvatarCropModal";
import { ScoreHeatmapCard } from "@/components/Profile/PlayerHeatmapSection";
import { ProfileVisibilityCard } from "@/components/Profile/ProfileVisibilityCard";
import { PlayerCard, type PlayerCardFields } from "@/components/Profile/PlayerPanel/PlayerCard";
import profileClasses from "@/components/Profile/Profile.module.css";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection";
import { GAME_NAMES } from "@/components/Friends/gameNames";
import { LoadingBlock } from "@/components/Friends/LoadingBlock";
import { FriendActionButtons } from "@/components/Friends/FriendActionButtons";
import { FriendScoreComparison } from "@/components/Friends/FriendScoreComparison";
import { MyScoreGap } from "@/components/Friends/MyScoreGap";
import { UploadTimeline } from "@/components/Friends/UploadTimeline";
import { useSendFriendRequest } from "@/hooks/useSendFriendRequest";
import { useFriendRelationActions } from "@/hooks/useFriendRelationActions";
import useFriendStore from "@/hooks/useFriendStore";
import { useUpdateUserProfile, useUploadUserAvatar } from "@/hooks/mutations/useUserMutations";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import { useUser } from "@/hooks/queries/useUser";
import { BestsGroup } from "@/pages/user/Scores/bests/ScoreBestsSection";
import { useFriendRelationship } from "@/hooks/queries/useFriends";
import { useFriendBests, useFriendHeatmap, useFriendScores } from "@/hooks/queries/useFriendScores";
import { formatDateTime } from "@/utils/time";
import { getFriendErrorMessage, getFriendLoadErrorMessage } from "@/utils/api/friend";
import { APIError } from "@/utils/errors";
import { openAlertModal, openRetryModal } from "@/utils/modal";
import { profilePath } from "@/utils/profile";
import { chartKey, indexByChart } from "@/utils/scoreCompare";
import { validateUserName } from "@/utils/validator";
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
      <SlotEmptyState state={slot.state} gameName={gameName}>
        {friend.games[otherGame].state === "visible" && (
          <Button variant="light" size="xs" mt="xs" onClick={() => setGame(otherGame)}>
            切换到「{GAME_NAMES[otherGame]}」查看
          </Button>
        )}
      </SlotEmptyState>
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

const HeatmapSection = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();
  const { heatmap, isLoading } = useFriendHeatmap(friend.user_id, game);
  return <ScoreHeatmapCard heatmap={heatmap} isLoading={isLoading} />;
};

const ProfileTab = ({ friend }: { friend: FriendRelationship }) => {
  const [game] = useGame();
  const slot = friend.games[game];
  const scoresVisible =
    (friend.status === "friend" || friend.status === "self") &&
    slot.state === "visible" &&
    !!slot.profile;

  return (
    <Stack gap="md">
      {friend.status === "self" && slot.state !== "unbound" && (
        <ProfileVisibilityCard game={game} />
      )}
      <GameCard slot={slot} friend={friend} />
      {scoresVisible && <HeatmapSection friend={friend} />}
      {scoresVisible && <StatisticsTab friend={friend} />}
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
  if (profile.status === "self") return null;
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
  const { setData: setUser, invalidate: invalidateUser } = useUser();
  const queryClient = useQueryClient();
  const uploadAvatar = useUploadUserAvatar();
  const updateProfile = useUpdateUserProfile();
  const listSearch = useFriendStore((state) => state.listSearch);
  const [game] = useGame();
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropOpened, cropModal] = useDisclosure(false);
  const [editNameOpened, editNameModal] = useDisclosure(false);
  const isSelf = profile?.status === "self";
  const accessible = !!profile && !error && profile.status !== "blocked";
  const showFriendTabs =
    (profile?.status === "friend" || isSelf) && profile?.games[game].state === "visible";
  const profileContent = profile && <ProfileTab friend={profile} />;

  const nameForm = useForm({
    initialValues: { name: "" },
    validate: {
      name: (value) => validateUserName(value, { allowEmpty: false }),
    },
  });

  const invalidateComments = () =>
    void queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        /^user\/(maimai|chunithm)\/comment\/list\?/.test(query.queryKey[0]),
    });

  const syncSelfAvatar = (avatarUrl: string | undefined) => {
    setUser((prev) => prev && { ...prev, avatar_url: avatarUrl });
    queryClient.setQueryData<FriendRelationship>(
      queryKeys.friends.relationship(username),
      (old) => old && { ...old, avatar_url: avatarUrl },
    );
    invalidateComments();
  };

  const avatarDialog = useFileDialog({
    multiple: false,
    accept: "image/jpeg,image/png,image/webp",
    onChange: (files) => {
      const file = files?.[0];
      if (!file) return;
      setCropImage(URL.createObjectURL(file));
      cropModal.open();
      avatarDialog.reset();
    },
  });

  const uploadCroppedAvatar = (file: File) => {
    uploadAvatar.mutate(file, {
      onSuccess: (data) => {
        syncSelfAvatar(data.avatar_url);
        cropModal.close();
      },
      onError: (err) => openAlertModal("头像上传失败", getFriendErrorMessage(err)),
    });
  };

  const releaseCropImage = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
  };

  const openEditName = () => {
    const currentName = profile?.username ?? username;
    nameForm.setInitialValues({ name: currentName });
    nameForm.setValues({ name: currentName });
    editNameModal.open();
  };

  const saveName = ({ name }: { name: string }) => {
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => {
          setUser((prev) => prev && { ...prev, name });
          if (profile) {
            queryClient.setQueryData<FriendRelationship>(queryKeys.friends.relationship(name), {
              ...profile,
              username: name,
            });
            queryClient.removeQueries({ queryKey: queryKeys.friends.relationship(username) });
          }
          invalidateComments();
          void invalidateUser();
          editNameModal.close();
          notifications.show({ title: "修改成功", message: "你的用户名已更新。", color: "green" });
          void navigate(`${profilePath(name)}${window.location.search}`, {
            overwriteLastHistoryEntry: true,
          });
        },
        onError: (err) => openRetryModal("修改失败", `${err}`, () => saveName({ name })),
      },
    );
  };

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
    <>
      {isSelf && (
        <>
          <AvatarCropModal
            opened={cropOpened}
            image={cropImage}
            uploading={uploadAvatar.isPending}
            onClose={cropModal.close}
            onExited={releaseCropImage}
            onConfirm={uploadCroppedAvatar}
          />
          <Modal opened={editNameOpened} onClose={editNameModal.close} title="修改用户名" centered>
            <form onSubmit={nameForm.onSubmit(saveName)}>
              <Stack gap="sm">
                <TextInput
                  label="用户名"
                  placeholder="4 到 16 个字母、数字或下划线"
                  description="修改后，已分享的好友链接将失效"
                  required
                  data-autofocus
                  disabled={updateProfile.isPending}
                  {...nameForm.getInputProps("name")}
                />
                <Group justify="flex-end" mt="md">
                  <Button
                    variant="default"
                    onClick={editNameModal.close}
                    disabled={updateProfile.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    loading={updateProfile.isPending}
                    disabled={!nameForm.isDirty()}
                  >
                    保存
                  </Button>
                </Group>
              </Stack>
            </form>
          </Modal>
        </>
      )}
      <Page
        meta={{
          title: profile?.remark || profile?.username || username,
          description: profile?.remark ? `@${profile.username}` : undefined,
        }}
        badge={
          isSelf ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="修改用户名"
              onClick={openEditName}
            >
              <IconEdit size={18} />
            </ActionIcon>
          ) : undefined
        }
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
        actions={profile && !error && !isSelf ? <ProfileActions profile={profile} /> : undefined}
        avatar={
          isLoading ? (
            <Skeleton circle h={96} w={96} />
          ) : isSelf ? (
            <EditAvatarButton
              radius="100%"
              onClick={avatarDialog.open}
              disabled={uploadAvatar.isPending}
            >
              <UserAvatar
                username={profile?.username ?? username}
                avatarUrl={profile?.avatar_url}
                size={96}
              />
            </EditAvatarButton>
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
                {
                  id: "bests",
                  name: "最佳成绩",
                  children: <BestsTab key={game} friend={profile} />,
                },
                {
                  id: "uploads",
                  name: "上传历史",
                  children: <UploadTimeline key={game} userId={profile.user_id} />,
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
    </>
  );
}
