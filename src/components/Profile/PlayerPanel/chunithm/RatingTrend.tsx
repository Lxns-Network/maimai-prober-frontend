import { useMemo, useState } from "react";
import { Box, Card, Text } from "@mantine/core";
import { EmptyState } from "@/components/EmptyState.tsx";
import { IconDatabaseOff } from "@tabler/icons-react";
import { RatingTrendControls, TrendQuickPreset } from "../RatingTrendControls.tsx";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChunithmRatingTrendProps {
  rating: number;
  bests_rating: number;
  selections_rating: number;
  recents_rating?: number;
  new_bests_rating?: number;
  date: string | number;
}

const formatDateString = (dateVal: number | string | Date): string => {
  const d = new Date(dateVal);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const RatingTrendChart = ({ trend }: { trend: ChunithmRatingTrendProps[] }) => {
  const formattedTrend = useMemo(() => {
    return trend.map((item) => ({
      ...item,
      date: new Date(item.date).getTime(),
    }));
  }, [trend]);

  const minDateStr = useMemo(
    () => (formattedTrend.length > 0 ? formatDateString(formattedTrend[0].date) : undefined),
    [formattedTrend],
  );
  const maxDateStr = useMemo(
    () =>
      formattedTrend.length > 0
        ? formatDateString(formattedTrend[formattedTrend.length - 1].date)
        : undefined,
    [formattedTrend],
  );

  const [preset, setPreset] = useState<TrendQuickPreset>("all");
  const [rangeLeft, setRangeLeft] = useState<number | "dataMin">("dataMin");
  const [rangeRight, setRangeRight] = useState<number | "dataMax">("dataMax");
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  const resetZoom = () => {
    setPreset("all");
    setRangeLeft("dataMin");
    setRangeRight("dataMax");
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handlePresetChange = (nextPreset: TrendQuickPreset) => {
    if (nextPreset === "custom") return;
    if (nextPreset === "all") {
      resetZoom();
      return;
    }
    const days = nextPreset === "7d" ? 7 : nextPreset === "30d" ? 30 : 90;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    setRangeLeft(start.setHours(0, 0, 0, 0));
    setRangeRight(end.setHours(23, 59, 59, 999));
    setPreset(nextPreset);
  };

  const handleDateRangeChange = (range: [string | null, string | null]) => {
    const [start, end] = range;
    if (start && end) {
      const startTime = new Date(start).setHours(0, 0, 0, 0);
      const endTime = new Date(end).setHours(23, 59, 59, 999);
      setRangeLeft(startTime);
      setRangeRight(endTime);
      setPreset("custom");
    }
  };

  const visibleData = useMemo(() => {
    return formattedTrend.filter((item) => {
      const matchLeft = rangeLeft === "dataMin" || item.date >= rangeLeft;
      const matchRight = rangeRight === "dataMax" || item.date <= rangeRight;
      return matchLeft && matchRight;
    });
  }, [formattedTrend, rangeLeft, rangeRight]);

  const summary = useMemo(() => {
    if (visibleData.length === 0) return null;
    const first = visibleData[0].rating;
    const last = visibleData[visibleData.length - 1].rating;
    return {
      start: first,
      end: last,
      diff: last - first,
      count: visibleData.length,
    };
  }, [visibleData]);

  const isZoomed = rangeLeft !== "dataMin" || rangeRight !== "dataMax";

  const currentDateRange = useMemo<[string | null, string | null]>(() => {
    if (!isZoomed) {
      return [minDateStr || null, maxDateStr || null];
    }
    const start = rangeLeft === "dataMin" ? minDateStr || null : formatDateString(rangeLeft);
    const end = rangeRight === "dataMax" ? maxDateStr || null : formatDateString(rangeRight);
    return [start, end];
  }, [isZoomed, rangeLeft, rangeRight, minDateStr, maxDateStr]);

  const handleZoom = () => {
    if (!refAreaLeft || !refAreaRight || refAreaLeft === refAreaRight) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    const [left, right] =
      refAreaLeft < refAreaRight ? [refAreaLeft, refAreaRight] : [refAreaRight, refAreaLeft];

    setRefAreaLeft(null);
    setRefAreaRight(null);
    setRangeLeft(left);
    setRangeRight(right);
    setPreset("custom");
  };

  return (
    <Box style={{ userSelect: "none" }}>
      {formattedTrend.length >= 2 && (
        <RatingTrendControls
          preset={preset}
          onPresetChange={handlePresetChange}
          onReset={resetZoom}
          isZoomed={isZoomed}
          dateRange={currentDateRange}
          onDateRangeChange={handleDateRangeChange}
          minDate={minDateStr}
          maxDate={formatDateString(new Date())}
          startRating={summary?.start}
          endRating={summary?.end}
          ratingDiff={summary?.diff}
          count={visibleData.length}
          isChunithm={true}
        />
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={formattedTrend}
          onMouseDown={(e) => {
            if (e && e.activeLabel) {
              setRefAreaLeft(Number(e.activeLabel));
            }
          }}
          onMouseMove={(e) => {
            if (refAreaLeft && e && e.activeLabel) {
              setRefAreaRight(Number(e.activeLabel));
            }
          }}
          onMouseUp={handleZoom}
        >
          <defs>
            <linearGradient id="rating" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            type="number"
            domain={[rangeLeft, rangeRight]}
            allowDataOverflow
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              })
            }
            fontSize={14}
          />
          <YAxis
            width={40}
            domain={([dataMin, dataMax]) => {
              dataMin -= 0.01;
              dataMax += 0.01;
              return [Math.round(dataMin * 100) / 100, Math.round(dataMax * 100) / 100];
            }}
            allowDataOverflow
            fontSize={14}
          />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip
            content={(props) => {
              if (!props.active || !props.payload || props.payload.length < 1) return null;
              const payload = props.payload[0].payload;
              return (
                <Card p="xs" withBorder fz="sm">
                  <Text>{new Date(payload.date).toLocaleDateString()}</Text>
                  <Text c="#8884d8">Rating: {Math.round(payload.rating * 100) / 100}</Text>
                  <Text c="#FD7E14">Best 30: {Math.round(payload.bests_rating * 100) / 100}</Text>
                  <Text>Selection 10: {Math.round(payload.selections_rating * 100) / 100}</Text>
                  {payload.recents_rating && (
                    <Text c="#228BE6">
                      Recent 10 (MAX): {Math.round(payload.recents_rating * 100) / 100}
                    </Text>
                  )}
                  {payload.new_bests_rating && (
                    <Text c="#15AABF">
                      Best 30 (New): {Math.round(payload.new_bests_rating * 100) / 100}
                    </Text>
                  )}
                </Card>
              );
            }}
          />
          <Area dataKey="rating" stroke="#8884d8" fillOpacity={1} fill="url(#rating)" />
          {refAreaLeft && refAreaRight ? (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.4}
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.3}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
};

export const ChunithmRatingTrend = ({ trend }: { trend: ChunithmRatingTrendProps[] | null }) => {
  if (!trend || trend.length < 2) {
    return (
      <EmptyState
        icon={<IconDatabaseOff size={64} stroke={1.5} />}
        title="历史记录不足，无法生成图表"
      />
    );
  }

  return (
    <>
      <RatingTrendChart trend={trend} />
      {trend[0].recents_rating && (
        <Text fz="xs" c="dimmed">
          ※ Recent 10 均为 Best #1 曲目，最终结果为理论不推分最高 Rating。
        </Text>
      )}
      <Text fz="xs" c="dimmed">
        ※ 该数据由历史同步成绩推出，而非玩家的历史 Rating，结果仅供参考。
      </Text>
    </>
  );
};
