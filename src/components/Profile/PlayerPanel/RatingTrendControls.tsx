import { useState } from "react";
import { Box, Button, Group, SegmentedControl, Text, useMantineTheme } from "@mantine/core";
import { DatePickerInput, DatesProvider } from "@mantine/dates";
import { useElementSize } from "@mantine/hooks";
import { IconCalendar, IconRotate } from "@tabler/icons-react";
import classes from "./RatingTrendControls.module.css";

export type TrendQuickPreset = "all" | "7d" | "30d" | "90d" | "custom";

interface RatingTrendControlsProps {
  preset: TrendQuickPreset;
  onPresetChange: (preset: TrendQuickPreset) => void;
  onReset: () => void;
  isZoomed: boolean;
  dateRange: [string | null, string | null];
  onDateRangeChange: (range: [string | null, string | null]) => void;
  minDate?: string;
  maxDate?: string;
  startRating?: number;
  endRating?: number;
  ratingDiff?: number;
  count?: number;
  isChunithm?: boolean;
}

const RatingTrendDatePicker = ({
  dateRange,
  onDateRangeChange,
  minDate,
  maxDate,
}: Pick<RatingTrendControlsProps, "dateRange" | "onDateRangeChange" | "minDate" | "maxDate">) => {
  const [draftRange, setDraftRange] = useState(dateRange);

  return (
    <DatePickerInput
      type="range"
      size="xs"
      w="max-content"
      maw="100%"
      leftSection={<IconCalendar size={14} />}
      placeholder="选择自定义区间"
      valueFormat="YYYY/M/D"
      value={draftRange}
      minDate={minDate}
      maxDate={maxDate}
      clearable={false}
      onChange={(range) => {
        setDraftRange(range);
        if (range[0] && range[1]) onDateRangeChange(range);
      }}
    />
  );
};

export const RatingTrendControls = ({
  preset,
  onPresetChange,
  onReset,
  isZoomed,
  dateRange,
  onDateRangeChange,
  minDate,
  maxDate,
  startRating,
  endRating,
  ratingDiff,
  count,
  isChunithm = false,
}: RatingTrendControlsProps) => {
  const { ref: containerRef, width: containerWidth } = useElementSize<HTMLDivElement>();
  const { ref: presetRef, width: presetWidth } = useElementSize<HTMLDivElement>();
  const { ref: dateControlsRef, width: dateControlsWidth } = useElementSize<HTMLDivElement>();
  const { ref: resetRef, width: resetWidth } = useElementSize<HTMLDivElement>();
  const theme = useMantineTheme();
  const gap = 4 * theme.scale;
  const reservedDateControlsWidth = dateControlsWidth + (isZoomed ? 0 : resetWidth + gap);
  const showPresets =
    presetWidth > 0 &&
    dateControlsWidth > 0 &&
    resetWidth > 0 &&
    presetWidth + reservedDateControlsWidth + gap <= containerWidth;
  const presetData = [
    { label: "全部", value: "all" },
    { label: "近 7 天", value: "7d" },
    { label: "近 30 天", value: "30d" },
    { label: "近 90 天", value: "90d" },
  ];
  const resetButton = (
    <Button
      variant="subtle"
      size="xs"
      px={6}
      color="gray"
      leftSection={<IconRotate size={14} />}
      onClick={onReset}
    >
      重置
    </Button>
  );

  const formatRating = (val?: number) => {
    if (val === undefined || isNaN(val)) return "-";
    return isChunithm ? (Math.round(val * 100) / 100).toFixed(2) : String(Math.round(val));
  };

  const formatDiff = (diff?: number) => {
    if (diff === undefined || isNaN(diff)) return "-";
    if (isChunithm) {
      const rounded = Math.round(diff * 100) / 100;
      return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
    }
    const rounded = Math.round(diff);
    return rounded > 0 ? `+${rounded}` : String(rounded);
  };

  const diffColor =
    ratingDiff === undefined || ratingDiff === 0 ? "dimmed" : ratingDiff > 0 ? "teal" : "red";

  return (
    <Box ref={containerRef} mb="xs" pos="relative">
      <Box ref={presetRef} className={classes.measure} aria-hidden="true" inert>
        <SegmentedControl size="xs" radius="md" value={preset} data={presetData} />
      </Box>
      <Box ref={resetRef} className={classes.measure} aria-hidden="true" inert>
        {resetButton}
      </Box>
      <Group gap={4} align="center" wrap="nowrap" mb={8}>
        {showPresets && (
          <SegmentedControl
            size="xs"
            radius="md"
            flex="0 0 auto"
            value={preset}
            data={presetData}
            onChange={(value) => onPresetChange(value as TrendQuickPreset)}
          />
        )}
        <Group
          ref={dateControlsRef}
          gap={4}
          align="center"
          wrap="nowrap"
          flex="0 0 auto"
          w="max-content"
          maw="100%"
          ml="auto"
        >
          <DatesProvider settings={{ locale: "zh-cn", firstDayOfWeek: 0, weekendDays: [0, 6] }}>
            <RatingTrendDatePicker
              key={dateRange.join(":")}
              dateRange={dateRange}
              minDate={minDate}
              maxDate={maxDate}
              onDateRangeChange={onDateRangeChange}
            />
          </DatesProvider>

          {isZoomed && resetButton}
        </Group>
      </Group>

      {count !== undefined && count > 0 && (
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap="xs" align="center">
            <Text fz="xs" c="dimmed">
              {isChunithm ? "Rating 变化：" : "DX Rating 变化："}
            </Text>
            <Text fz="xs" fw={600}>
              {formatRating(startRating)} → {formatRating(endRating)}
            </Text>
            <Text fz="xs" c={diffColor}>
              ({formatDiff(ratingDiff)})
            </Text>
          </Group>

          <Text fz="xs" c="dimmed">
            记录点: {count} 条
          </Text>
        </Group>
      )}
      {count === 0 && (
        <Text fz="xs" c="dimmed" ta="center" py="xs">
          该区间暂无历史记录
        </Text>
      )}
    </Box>
  );
};
