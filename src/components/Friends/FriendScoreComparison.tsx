import { useMemo, useState } from "react";
import { Card, Group, Progress, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { IconDatabaseOff, IconUserOff } from "@tabler/icons-react";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ResponsivePagination } from "@/components/ResponsivePagination";
import { ScoreList } from "@/components/Scores/ScoreList";
import profileClasses from "@/components/Profile/Profile.module.css";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import useGame from "@/hooks/useGame";
import { FriendItem } from "@/types/friend";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { chartKey, compareScores } from "@/utils/scoreCompare";
import { GAME_NAMES } from "./gameNames";
import { LoadingBlock } from "./LoadingBlock";
import { MyScoreGap } from "./MyScoreGap";

const PAGE_SIZE = 30;

type View = "behind" | "ahead" | "only_theirs";

const VIEW_HINTS: Record<View, string> = {
  behind: "双方都玩过、你的成绩更低的谱面，差距最大的在前",
  ahead: "双方都玩过、你的成绩更高的谱面，差距最大的在前",
  only_theirs: "TA 玩过而你还没有成绩的谱面，按 TA 的单曲 Rating 从高到低",
};

const VIEW_EMPTY: Record<View, string> = {
  behind: "没有落后于 TA 的谱面",
  ahead: "没有领先于 TA 的谱面",
  only_theirs: "TA 玩过的谱面你都玩过了",
};

const formatRating = (game: Game, rating: number) =>
  game === "maimai" ? String(rating) : rating.toFixed(2);

/**
 * 与好友逐谱面对比：双方各自的最佳成绩按谱面配对，全部在本地计算。
 * 调用方负责确认双方是好友，并传入对方的全部成绩。
 */
export const FriendScoreComparison = ({
  friend,
  theirScores,
}: {
  friend: Pick<FriendItem, "games">;
  theirScores: (MaimaiScoreProps | ChunithmScoreProps)[];
}) => {
  const [game] = useGame();
  const { player, isLoading: playerLoading } = usePlayer(game);
  const { scores: myScores, isLoading, error, invalidate } = useScores(game);
  const [view, setView] = useState<View>("behind");
  const [page, setPage] = useState(1);

  const comparison = useMemo(() => compareScores(myScores, theirScores), [myScores, theirScores]);
  const myScoreByChart = useMemo(
    () =>
      new Map(
        [...comparison.ahead, ...comparison.behind].map((pair) => [
          chartKey(pair.theirs),
          pair.mine,
        ]),
      ),
    [comparison],
  );

  const gameName = GAME_NAMES[game];

  if (playerLoading || (player && isLoading)) return <LoadingBlock />;

  if (!player) {
    return (
      <EmptyState
        icon={<IconUserOff size={64} stroke={1.5} />}
        title={`你尚未绑定「${gameName}」`}
        description="绑定并同步游戏数据后，即可与好友逐谱面对比成绩"
      />
    );
  }

  if (error) {
    return (
      <QueryErrorState
        title="你的成绩加载失败"
        description="请检查网络连接后重试"
        onRetry={() => void invalidate()}
      />
    );
  }

  const { ahead, behind, tied, onlyTheirs, onlyMineCount } = comparison;
  const common = ahead.length + behind.length + tied.length;
  const theirRating = friend.games[game].profile?.rating;
  const percent = (count: number) => (common > 0 ? (count / common) * 100 : 0);

  const items = view === "only_theirs" ? onlyTheirs : comparison[view].map((pair) => pair.theirs);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Stack gap="md">
      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <Group justify="space-between" gap="xs" mb="xs">
          <Text fw={600} size="sm">
            共同游玩 {common} 张谱面
          </Text>
          {theirRating !== undefined && (
            <Text size="xs" c="dimmed">
              评分：我 {formatRating(game, player.rating)} · TA {formatRating(game, theirRating)}
            </Text>
          )}
        </Group>

        {common > 0 ? (
          <>
            <Progress.Root size="lg" radius="xl">
              <Tooltip label={`你领先 ${ahead.length} 张`}>
                <Progress.Section value={percent(ahead.length)} color="teal" />
              </Tooltip>
              <Tooltip label={`持平 ${tied.length} 张`}>
                <Progress.Section value={percent(tied.length)} color="gray" />
              </Tooltip>
              <Tooltip label={`你落后 ${behind.length} 张`}>
                <Progress.Section value={percent(behind.length)} color="red" />
              </Tooltip>
            </Progress.Root>
            <Group gap="md" mt="xs">
              <Text size="xs" c="teal">
                领先 {ahead.length} 张
              </Text>
              <Text size="xs" c="dimmed">
                持平 {tied.length} 张
              </Text>
              <Text size="xs" c="red">
                落后 {behind.length} 张
              </Text>
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            你们还没有都玩过的谱面
          </Text>
        )}

        <Text size="xs" c="dimmed" mt="xs">
          TA 玩过而你未游玩 {onlyTheirs.length} 张，你玩过而 TA 未游玩 {onlyMineCount} 张
        </Text>
      </Card>

      <SegmentedControl
        value={view}
        onChange={(value) => {
          setView(value as View);
          setPage(1);
        }}
        fullWidth
        data={[
          { value: "behind", label: `落后 ${behind.length}` },
          { value: "ahead", label: `领先 ${ahead.length}` },
          { value: "only_theirs", label: `未游玩 ${onlyTheirs.length}` },
        ]}
      />
      <Text size="xs" c="dimmed" mt={-8}>
        {VIEW_HINTS[view]}
      </Text>

      {items.length === 0 ? (
        <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title={VIEW_EMPTY[view]} />
      ) : (
        <>
          <ScoreList
            scores={pageItems}
            readOnly
            renderFooter={
              view === "only_theirs"
                ? undefined
                : (score) => (
                    <MyScoreGap
                      game={game}
                      mine={myScoreByChart.get(chartKey(score))}
                      theirs={score}
                    />
                  )
            }
          />
          <ResponsivePagination
            total={totalPages}
            value={currentPage}
            onChange={setPage}
            hideWithOnePage
          />
        </>
      )}
    </Stack>
  );
};
