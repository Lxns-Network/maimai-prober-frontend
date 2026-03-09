import { Card, Loader, Overlay, ScrollArea, Text, useComputedColorScheme } from "@mantine/core";
import { Heatmap } from "@mantine/charts";
import classes from "@/components/Profile/Profile.module.css";
import { useMemo } from "react";
import { usePlayerHeatmap } from "@/hooks/queries/usePlayerHeatmap.ts";
import useGame from "@/hooks/useGame.ts";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";

const generateRandomHeatmap = (start: Date, end: Date): Record<string, number> => {
  const data: Record<string, number> = {};
  const day = 24 * 60 * 60 * 1000;
  for (let d = start.getTime(); d <= end.getTime(); d += day) {
    const dateStr = new Date(d).toISOString().split("T")[0];
    const random = Math.floor(Math.random() * 30); // 0 到 29 个成绩
    data[dateStr] = Math.random() < 0.6 ? 0 : random; // 有 60% 的天是空的
  }
  return data;
};

export const PlayerHeatmapSection = () => {
  const [game] = useGame();
  const computedColorScheme = useComputedColorScheme('light');

  const { player, isLoading: isPlayerLoading } = usePlayer(game);
  const { heatmap, isLoading } = usePlayerHeatmap(game);

  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  const startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().split('T')[0];

  const scaledHeatmap = useMemo(() => {
    if (!player) {
      const end = new Date();
      const start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
      return generateRandomHeatmap(start, end);
    }
    if (!heatmap) return {};
    return Object.fromEntries(
      Object.entries(heatmap).map(([date, value]) => [date, Math.log(value + 1)])
    );
  }, [player, heatmap]);

  return (
    <Card className={classes.card} withBorder radius="md" p={0}>
      {!isPlayerLoading && !player && (
        <Overlay color={
          computedColorScheme === 'dark' ? "#000" : "#FFF"
        } blur={5} center zIndex={1}>
          <Text>同步游戏数据后查看热力图</Text>
        </Overlay>
      )}
      {(isLoading || isPlayerLoading) && (
        <Overlay color={
          computedColorScheme === 'dark' ? "#000" : "#FFF"
        } blur={5} center zIndex={1}>
          <Loader />
        </Overlay>
      )}
      <ScrollArea>
        <Heatmap
          data={scaledHeatmap}
          startDate={startDate}
          endDate={endDate}
          withOutsideDates={false}
          withMonthLabels
          withWeekdayLabels
          withTooltip
          monthLabels={["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]}
          weekdayLabels={["周日", "周一", "", "周三", "", "周五", ""]}
          getTooltipLabel={({ date }) => {
            const original = heatmap?.[date] ?? 0;
            return `${date} – ${original} 个成绩`;
          }}
          m="md"
          pr="md"
        />
      </ScrollArea>
    </Card>
  )
}
