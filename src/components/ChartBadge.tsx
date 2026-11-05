import { Badge, type MantineColor } from "@mantine/core";
import { type ReactNode } from "react";

const CHART_TYPE_BADGES: Partial<Record<string, { label: string; color: MantineColor }>> = {
  standard: { label: "标准", color: "blue" },
  dx: { label: "DX", color: "orange" },
  utage: { label: "宴", color: "pink" },
  worldsend: { label: "WORLD'S END", color: "gray" },
};

/** 谱面类型徽章；没有对应类型的谱面（如中二节奏普通谱面）不渲染。 */
export const ChartTypeBadge = ({ type }: { type: string }) => {
  const badge = CHART_TYPE_BADGES[type];
  if (!badge) return null;
  return (
    <Badge size="xs" radius="sm" variant="light" color={badge.color}>
      {badge.label}
    </Badge>
  );
};

export const ChartLevelBadge = ({ color, children }: { color: string; children: ReactNode }) => (
  <Badge size="xs" radius="sm" px={5} color={color}>
    {children}
  </Badge>
);
