import { Card, Loader, Overlay, ScrollArea, Text, useComputedColorScheme } from "@mantine/core";
import { Heatmap } from "@mantine/charts";
import classes from "@/components/Profile/Profile.module.css";
import { useCallback, useEffect, useState } from "react";
import { getPlayerHeatmap } from "@/utils/api/player.ts";
import useGame from "@/hooks/useGame.ts";
import { Game } from "@/types/game";
import { openRetryModal } from "@/utils/modal.tsx";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";

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
  const { player } = usePlayer(game);
  const [fetching, setFetching] = useState(true);
  const [rawHeatmap, setRawHeatmap] = useState<Record<string, number>>({});
  const [scaledHeatmap, setScaledHeatmap] = useState<Record<string, number>>({});
  const computedColorScheme = useComputedColorScheme('light');

  const endDate = new Date();
  const startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());

  const getPlayerHeatmapData = useCallback(async (game: Game) => {
    setFetching(true);
    try {
      const res = await getPlayerHeatmap(game);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setRawHeatmap(data.data);
      setScaledHeatmap(Object.fromEntries(
        Object.entries(data.data).map(([date, value]) => [date, Math.log((value as number) + 1)])
      ));
      setFetching(false);
    } catch (error) {
      openRetryModal("玩家热力图获取失败", `${error}`, () => getPlayerHeatmapData(game))
    }
  }, [game]);

  useEffect(() => {
    getPlayerHeatmapData(game);
  }, [game]);

  useEffect(() => {
    if (!player) setScaledHeatmap(generateRandomHeatmap(startDate, endDate));
  }, [player]);

  return (
    <Card className={classes.card} withBorder radius="md" p={0}>
      {!player && (
        <Overlay color={
          computedColorScheme === 'dark' ? "#000" : "#FFF"
        } blur={5} center zIndex={1}>
          <Text>同步游戏数据后查看热力图</Text>
        </Overlay>
      )}
      {fetching && (
        <Overlay color={
          computedColorScheme === 'dark' ? "#000" : "#FFF"
        } blur={5} center zIndex={1}>
          <Loader />
        </Overlay>
      )}
      <ScrollArea>
        <Heatmap
          data={scaledHeatmap}
          startDate={startDate.toISOString().split('T')[0]}
          endDate={endDate.toISOString().split('T')[0]}
          withOutsideDates={false}
          withMonthLabels
          withWeekdayLabels
          withTooltip
          monthLabels={["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]}
          weekdayLabels={["周日", "周一", "", "周三", "", "周五", ""]}
          getTooltipLabel={({ date }) => {
            const original = rawHeatmap[date] ?? 0;
            return `${date} – ${original} 个成绩`;
          }}
          m="md"
          pr="md"
        />
      </ScrollArea>
    </Card>
  )
}