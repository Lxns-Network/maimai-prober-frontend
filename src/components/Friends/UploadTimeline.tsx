import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Timeline,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconDatabaseOff } from "@tabler/icons-react";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ScoreCard } from "@/components/Scores/ScoreList";
import { openScoreModal } from "@/components/Scores/openScoreModal";
import timelineClasses from "@/components/Songs/ReleaseTimeline.module.css";
import { useFriendHeatmap, useFriendUploads } from "@/hooks/queries/useFriendScores";
import useGame from "@/hooks/useGame";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { getFriendLoadErrorMessage } from "@/utils/api/friend";
import { formatReleaseDate, formatReleaseOffset } from "@/utils/releaseTimeline";
import { LoadingBlock } from "./LoadingBlock";

const DAYS_PER_PAGE = 30;
const SCORES_PER_PAGE = 30;

const UploadCard = ({
  game,
  score,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps;
}) => {
  const open = () => openScoreModal({ game, score, readOnly: true });
  if ("type" in score) return <ScoreCard game="maimai" score={score} onClick={open} />;
  return <ScoreCard game="chunithm" score={score} onClick={open} />;
};

const DayUploads = ({ userId, date }: { userId: number; date: string }) => {
  const [game] = useGame();
  const { uploads, isLoading, error, refetch } = useFriendUploads(userId, game, date);
  const [limit, setLimit] = useState(SCORES_PER_PAGE);
  const remaining = uploads.length - limit;

  if (isLoading) return <LoadingBlock />;
  if (error) {
    return (
      <QueryErrorState
        title="成绩加载失败"
        description={getFriendLoadErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Stack gap="xs">
      <SimpleGrid type="container" cols={{ base: 1, "400px": 2, "700px": 3 }} spacing="xs">
        {uploads.slice(0, limit).map((score, index) => (
          <UploadCard key={`${score.upload_time}:${index}`} game={game} score={score} />
        ))}
      </SimpleGrid>
      {remaining > 0 && (
        <Button
          variant="default"
          size="xs"
          fullWidth
          onClick={() => setLimit((value) => value + SCORES_PER_PAGE)}
        >
          显示更多（还有 {remaining} 条）
        </Button>
      )}
    </Stack>
  );
};

const DayItem = ({
  userId,
  date,
  count,
  now,
  defaultOpened,
}: {
  userId: number;
  date: string;
  count: number;
  now: Date;
  defaultOpened: boolean;
}) => {
  const [opened, setOpened] = useState(defaultOpened);

  return (
    <>
      <UnstyledButton
        className={timelineClasses.header}
        mod={{ expanded: opened }}
        aria-expanded={opened}
        onClick={() => setOpened((value) => !value)}
      >
        <Box flex={1} miw={0}>
          <Group gap="xs" wrap="wrap" mih={24}>
            <Text fw={600} lh="24px">
              {formatReleaseDate(date, now)}
            </Text>
            <Text size="sm" c="dimmed" lh="24px">
              {formatReleaseOffset(date, now)}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" lh="20px">
            上传 {count} 条成绩
          </Text>
        </Box>
        <IconChevronDown size={18} className={timelineClasses.chevron} />
      </UnstyledButton>
      <Collapse expanded={opened} keepMounted={false}>
        <Box pt="sm">
          <DayUploads userId={userId} date={date} />
        </Box>
      </Collapse>
    </>
  );
};

/** 按北京时间日期倒序列出上传记录；某一天展开时才请求当天的成绩。 */
export const UploadTimeline = ({ userId }: { userId: number }) => {
  const [game] = useGame();
  const { heatmap, isLoading, error, refetch } = useFriendHeatmap(userId, game);
  const now = useMemo(() => new Date(), []);
  const [dayLimit, setDayLimit] = useState(DAYS_PER_PAGE);
  const days = useMemo(
    () =>
      Object.entries(heatmap ?? {})
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => b.localeCompare(a)),
    [heatmap],
  );

  if (isLoading) return <LoadingBlock />;
  if (error) {
    return (
      <QueryErrorState
        title="上传记录加载失败"
        description={getFriendLoadErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }
  if (days.length === 0) {
    return <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="暂无上传记录" />;
  }

  const visibleDays = days.slice(0, dayLimit);
  const remaining = days.length - visibleDays.length;

  return (
    <Stack gap="lg">
      <Timeline
        active={visibleDays.length - 1}
        bulletSize={24}
        lineWidth={2}
        classNames={{ item: timelineClasses.item }}
      >
        {visibleDays.map(([date, count], index) => (
          <Timeline.Item key={date}>
            <DayItem
              userId={userId}
              date={date}
              count={count}
              now={now}
              defaultOpened={index === 0}
            />
          </Timeline.Item>
        ))}
      </Timeline>
      {remaining > 0 && (
        <Button
          variant="default"
          size="xs"
          fullWidth
          onClick={() => setDayLimit((value) => value + DAYS_PER_PAGE)}
        >
          显示更多（还有 {remaining} 天）
        </Button>
      )}
    </Stack>
  );
};
