import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import {
  Badge,
  Box,
  Group,
  NumberFormatter,
  Paper,
  type PaperProps,
  rem,
  Text,
} from "@mantine/core";
import { getRankMedalColor } from "@/utils/color.ts";

// 主题色浅底是半透明的，叠在页面底色上，固定在底部的行才不会透出下方滚动的内容。
const highlightBackground =
  "linear-gradient(var(--mantine-primary-color-light), var(--mantine-primary-color-light)), var(--mantine-color-body)";

/** 达成率固定显示 4 位小数，整数部分放大；`value` 为空时不渲染。 */
const AchievementsText = ({ value, size = 18 }: { value?: number; size?: number }) => {
  if (value === undefined) return null;
  const [integer, fraction = "0"] = String(value).split(".");
  return (
    <Text fz={rem(size)} lh={rem(size)} style={{ flexShrink: 0 }}>
      {integer}
      <Text span inherit fz={rem(size - 4)}>
        .{fraction.padEnd(4, "0")}%
      </Text>
    </Text>
  );
};

const ScoreValueText = ({ value, size = 18 }: { value?: number; size?: number }) => {
  if (value === undefined) return null;
  return (
    <Text fz={rem(size)} lh={rem(size)} style={{ flexShrink: 0 }}>
      <NumberFormatter value={value} thousandSeparator />
    </Text>
  );
};

interface RankingRowProps
  extends PaperProps, Omit<ComponentPropsWithoutRef<"div">, keyof PaperProps | "children"> {
  rank: number;
  name: ReactNode;
  achievements?: number;
  score?: number;
  /** 名字之前的内容（如头像）。 */
  leading?: ReactNode;
  /** 数值之后的内容（如展开箭头）。 */
  trailing?: ReactNode;
  /** 以主题色底标出当前用户自己的一行。 */
  highlighted?: boolean;
}

/** 排行榜的一行：名次徽章 + 名字 + 达成率/分数，好友排行与全服排行共用同一视觉。 */
export const RankingRow = ({
  rank,
  name,
  achievements,
  score,
  leading,
  trailing,
  highlighted,
  ...paperProps
}: RankingRowProps) => (
  <Paper
    radius="md"
    withBorder
    px="sm"
    py={6}
    bg={highlighted ? highlightBackground : undefined}
    {...paperProps}
  >
    <Group wrap="nowrap" gap="sm">
      <Badge variant="light" color={getRankMedalColor(rank)} miw={rem(36)} px={6}>
        {rank}
      </Badge>
      {leading}
      <Box flex={1} miw={0}>
        {name}
      </Box>
      <AchievementsText value={achievements} />
      <ScoreValueText value={score} />
      {trailing}
    </Group>
  </Paper>
);
