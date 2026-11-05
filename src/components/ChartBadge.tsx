import { Badge, type BadgeProps, type MantineColor } from "@mantine/core";
import { type ReactNode } from "react";

const CHART_TYPE_BADGES: Partial<Record<string, { label: string; color: MantineColor }>> = {
  standard: { label: "标准", color: "blue" },
  dx: { label: "DX", color: "orange" },
  utage: { label: "宴", color: "pink" },
  worldsend: { label: "WORLD'S END", color: "gray" },
};

/** 成绩卡片与成绩详情用 `filled`；列表、时间线等紧凑场景用 `light`。 */
const CHART_TYPE_BADGE_VARIANTS = {
  light: { variant: "light", size: "xs", radius: "sm" },
  filled: { variant: "filled", size: "sm" },
} as const satisfies Record<string, BadgeProps>;

/** 谱面类型徽章；没有对应类型的谱面（如中二节奏普通谱面）不渲染。 */
export const ChartTypeBadge = ({
  type,
  variant = "light",
  ...badgeProps
}: {
  type: string;
  variant?: keyof typeof CHART_TYPE_BADGE_VARIANTS;
} & Omit<BadgeProps, "variant" | "color">) => {
  const badge = CHART_TYPE_BADGES[type];
  if (!badge) return null;
  return (
    <Badge {...CHART_TYPE_BADGE_VARIANTS[variant]} color={badge.color} {...badgeProps}>
      {badge.label}
    </Badge>
  );
};

export const ChartLevelBadge = ({ color, children }: { color: string; children: ReactNode }) => (
  <Badge size="xs" radius="sm" px={5} color={color}>
    {children}
  </Badge>
);
