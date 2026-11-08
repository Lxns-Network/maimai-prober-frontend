import { Avatar, Badge, Box, Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { ChartLevelBadge, ChartTypeBadge } from "@/components/ChartBadge";
import { MusicIcon } from "@/components/MusicIcon";
import profileClasses from "@/components/Profile/Profile.module.css";
import { openScoreModal } from "@/components/Scores/openScoreModal";
import useSongListStore from "@/hooks/useSongListStore";
import { ASSET_URL } from "@/main";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { getScoreCardBackgroundColor } from "@/utils/color";
import { scoreColorIndex } from "@/utils/score";
import {
  CompareMetric,
  chartLevelValue,
  formatScoreGap,
  formatScoreValue,
  scoreGap,
} from "@/utils/scoreCompare";
import classes from "./Friends.module.css";

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

const ScoreSide = ({
  game,
  score,
  metric,
  align,
}: {
  game: Game;
  score?: AnyScore;
  metric: CompareMetric;
  align: "flex-start" | "flex-end";
}) => (
  <Stack gap={4} align={align} flex={1} miw={0}>
    <Text fz="lg" fw={700} lh={1} c={score ? undefined : "dimmed"}>
      {score ? formatScoreValue(score, metric) : "未游玩"}
    </Text>
    {game === "maimai" && (
      <Text fz="xs" lh={1} c="dimmed">
        {score && "type" in score
          ? metric === "dx_score"
            ? formatScoreValue(score)
            : `DX ${score.dx_score.toLocaleString("en-US")}`
          : "\u00a0"}
      </Text>
    )}
    {/* 24px 的图标素材四周约有 2px 透明边：底部与外侧用负边距贴齐卡片内边距；顶部保留透明边，与上方文字的间距才和上一行一致。 */}
    <Group
      gap={0}
      wrap="nowrap"
      mb={-2}
      ml={align === "flex-start" ? -2 : undefined}
      mr={align === "flex-end" ? -2 : undefined}
    >
      <MusicIcon game={game} value={score && ("type" in score ? score.fc : score.full_combo)} />
      <MusicIcon game={game} value={score && ("type" in score ? score.fs : score.full_chain)} />
    </Group>
  </Stack>
);

const formatRatingGap = (game: Game, gap: number) => {
  const magnitude = game === "maimai" ? String(Math.abs(gap)) : Math.abs(gap).toFixed(2);
  return `Rating ${gap > 0 ? "+" : gap < 0 ? "-" : "±"}${magnitude}`;
};

/**
 * 「好友 VS」的单张谱面对比：曲目信息在上，左右为双方成绩，中间为分差。
 * 传入 `ratingGap` 时在分差下方显示单曲 Rating 差。
 */
export const FriendVsCard = ({
  game,
  mine,
  theirs,
  metric,
  ratingGap,
}: {
  game: Game;
  mine?: AnyScore;
  theirs: AnyScore;
  metric: CompareMetric;
  ratingGap?: number;
}) => {
  const songList = useSongListStore((state) => state[game]);
  const gap = mine ? scoreGap(mine, theirs, metric) : undefined;
  const levelIndex = scoreColorIndex(theirs);
  const levelValue = chartLevelValue(songList, theirs);

  return (
    <Card className={[profileClasses.card, classes.card].join(" ")} withBorder radius="md" p={0}>
      <UnstyledButton
        p="md"
        className={classes.cardDetailsTrigger}
        onClick={() => openScoreModal({ game, score: theirs, readOnly: true })}
      >
        <Group gap="sm" wrap="nowrap">
          <Avatar
            src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(theirs.id)}.png!webp`}
            size={48}
            radius="md"
            imageProps={{ loading: "lazy" }}
          >
            <IconPhotoOff size={18} />
          </Avatar>
          <Box miw={0} flex={1}>
            <Text truncate size="sm" fw={600} lh={1.2}>
              {theirs.song_name}
            </Text>
            <Group gap={4} mt={4} wrap="nowrap">
              {"type" in theirs && <ChartTypeBadge type={theirs.type} />}
              <ChartLevelBadge color={getScoreCardBackgroundColor(game, levelIndex)}>
                {levelValue === undefined ? theirs.level : levelValue.toFixed(1)}
              </ChartLevelBadge>
            </Group>
          </Box>
        </Group>

        <Group mt="sm" gap="xs" wrap="nowrap" align="center">
          <ScoreSide game={game} score={mine} metric={metric} align="flex-start" />
          <Stack gap={2} align="center">
            {gap === undefined ? (
              <Text fz="sm" fw={700} c="dimmed">
                VS
              </Text>
            ) : (
              <Badge variant="light" color={gap > 0 ? "teal" : gap < 0 ? "red" : "gray"}>
                {gap === 0 ? "持平" : formatScoreGap(game, gap, metric)}
              </Badge>
            )}
            {ratingGap !== undefined && (
              <Text fz="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {formatRatingGap(game, ratingGap)}
              </Text>
            )}
          </Stack>
          <ScoreSide game={game} score={theirs} metric={metric} align="flex-end" />
        </Group>
      </UnstyledButton>
    </Card>
  );
};
