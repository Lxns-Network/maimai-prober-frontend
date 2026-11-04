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
  leading?: ReactNode;
  trailing?: ReactNode;
  highlighted?: boolean;
}

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
