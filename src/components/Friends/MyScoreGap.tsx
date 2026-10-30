import { Badge, Group, Text } from "@mantine/core";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { formatScoreGap, formatScoreValue, scoreGap } from "@/utils/scoreCompare";

/** 好友成绩卡片下方的一行：本人在同一谱面的成绩与差距，正数表示本人领先。 */
export const MyScoreGap = ({
  game,
  mine,
  theirs,
}: {
  game: Game;
  mine?: MaimaiScoreProps | ChunithmScoreProps;
  theirs: MaimaiScoreProps | ChunithmScoreProps;
}) => {
  const gap = mine ? scoreGap(mine, theirs) : undefined;

  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" px={4}>
      <Text fz="xs" c="dimmed" truncate="end">
        我：{mine ? formatScoreValue(mine) : "未游玩"}
      </Text>
      {gap !== undefined && (
        <Badge
          size="xs"
          variant="light"
          color={gap > 0 ? "teal" : gap < 0 ? "red" : "gray"}
          style={{ flexShrink: 0 }}
        >
          {gap === 0 ? "持平" : formatScoreGap(game, gap)}
        </Badge>
      )}
    </Group>
  );
};
