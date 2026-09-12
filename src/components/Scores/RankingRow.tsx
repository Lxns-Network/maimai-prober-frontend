import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Badge, Group, NumberFormatter, Paper, type PaperProps, rem, Text } from "@mantine/core";

const medalColor = (rank: number) =>
  rank === 1 ? "yellow" : rank === 2 ? "gray" : rank === 3 ? "orange" : undefined;

/** 达成率固定显示 4 位小数，整数部分放大；`value` 为空时不渲染。 */
const AchievementsText = ({ value, size = 18 }: { value?: number; size?: number }) => {
  if (value === undefined) return null;
  const [integer, fraction = "0"] = String(value).split(".");
  return (
    <Text fz={rem(size)} style={{ lineHeight: rem(size), flexShrink: 0 }}>
      {integer}
      <span style={{ fontSize: rem(size - 4) }}>.{fraction.padEnd(4, "0")}%</span>
    </Text>
  );
};

const ScoreValueText = ({ value, size = 18 }: { value?: number; size?: number }) => {
  if (value === undefined) return null;
  return (
    <Text fz={rem(size)} style={{ lineHeight: rem(size), flexShrink: 0 }}>
      <NumberFormatter value={value} thousandSeparator />
    </Text>
  );
};

interface RankingRowProps
  extends PaperProps, Omit<ComponentPropsWithoutRef<"div">, keyof PaperProps | "children"> {
  rank: number;
  /** 名字槽位；由调用方决定是纯文本还是可跳转的档案链接。 */
  name: ReactNode;
  achievements?: number;
  score?: number;
  /** 名字之前的内容（如头像）。 */
  leading?: ReactNode;
  /** 数值之后的内容（如展开箭头）。 */
  trailing?: ReactNode;
}

/** 排行榜的一行：名次徽章 + 名字 + 达成率/分数，好友排行与全服排行共用同一视觉。 */
export const RankingRow = ({
  rank,
  name,
  achievements,
  score,
  leading,
  trailing,
  style,
  ...paperProps
}: RankingRowProps) => (
  <Paper radius="md" withBorder style={{ padding: "6px 12px", ...style }} {...paperProps}>
    <Group wrap="nowrap" gap="sm">
      <Badge variant="light" color={medalColor(rank)} circle={rank < 100}>
        {rank}
      </Badge>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
      <AchievementsText value={achievements} />
      <ScoreValueText value={score} />
      {trailing}
    </Group>
  </Paper>
);
