import { type Ref, useState } from "react";
import { createPortal } from "react-dom";
import { AspectRatio, Box, Center, Text, Tooltip } from "@mantine/core";
import { useIntersection } from "@mantine/hooks";
import { LANE_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { lanePosition } from "@lxns-network/chunithm-chart-engine/notes/space";
import { SPACE_CONSTANTS } from "@lxns-network/chunithm-chart-engine/notes/tables";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import type { useChartPreview } from "../hooks/useChartPreview";
import { AIR_TOP, GROUND_HEIGHT, groundBoundary, groundRow } from "../input/touchZones";
import { OptionSlider } from "./OptionSlider";

const groundHeights = Array.from({ length: GROUND_HEIGHT.max - GROUND_HEIGHT.min + 1 }, (_, i) => {
  const height = GROUND_HEIGHT.min + i;
  return { value: String(height), label: `${height}%` };
});
const visibleBandRatio = 0.95;

function JudgmentLine({ projection: m }: { projection: Float32Array }) {
  const z = SPACE_CONSTANTS.depthOrigin;
  const endpoint = (lane: number) => {
    const x = lanePosition(lane, 0);
    const w = m[12] * x + m[14] * z + m[15];
    return {
      x: (1 + (m[0] * x + m[2] * z + m[3]) / w) / 2,
      y: (1 - (m[4] * x + m[6] * z + m[7]) / w) / 2,
    };
  };
  const left = endpoint(0);
  const right = endpoint(LANE_COUNT);
  return (
    <Box
      component="svg"
      pos="absolute"
      inset={0}
      w="100%"
      h="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
      style={{ zIndex: 1 }}
    >
      <line
        x1={left.x}
        y1={left.y}
        x2={right.x}
        y2={right.y}
        stroke="var(--mantine-color-yellow-4)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </Box>
  );
}

function GroundBand({
  height,
  projection,
  ref,
}: {
  height: number;
  projection: Float32Array;
  ref?: Ref<HTMLDivElement>;
}) {
  const top = groundRow(projection, groundBoundary(height));
  const bottom = groundRow(projection, 1);
  const dividers = Array.from({ length: LANE_COUNT - 1 }, (_, i) => {
    const lane = i + 1;
    return `M${top.xAt(lane)} 0 L${bottom.xAt(lane)} 1`;
  }).join(" ");
  return (
    <Box
      ref={ref}
      pos="absolute"
      bottom={0}
      left={0}
      w="100%"
      h={`${height}%`}
      aria-hidden
      style={{ pointerEvents: "none", zIndex: 1 }}
    >
      <svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none" display="block">
        <rect width="1" height="1" fill="var(--mantine-color-blue-6)" fillOpacity={0.48} />
        <path d={dividers} stroke="white" strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />
        <path d="M0 0 H1" stroke="white" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </svg>
    </Box>
  );
}

export function GroundHeightSlider({
  preview,
  disabled,
}: {
  preview: ReturnType<typeof useChartPreview>;
  disabled: boolean;
}) {
  const { groundHeight } = preview;
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const { ref, entry } = useIntersection<HTMLDivElement>({ threshold: visibleBandRatio });
  const active = !disabled && (hovered || pressed || keyboardFocus);
  const frame = active ? preview.canvasRef.current?.parentElement : null;
  const projection = frame && preview.touchProjection();

  return (
    <>
      <Tooltip
        opened={!!projection && !!entry && entry.intersectionRatio < visibleBandRatio}
        events={{ hover: false, focus: false, touch: false }}
        transitionProps={{ duration: 0 }}
        color="dark.8"
        radius="md"
        p={0}
        withArrow
        label={
          <AspectRatio
            ratio={16 / 9}
            w={208}
            bdrs="md"
            style={{ overflow: "hidden" }}
            role="img"
            aria-label={`地键占画布底部 ${groundHeight}%，共 ${LANE_COUNT} 列，黄线为判定线`}
          >
            <Box pos="relative">
              <Center
                pos="absolute"
                left={0}
                right={0}
                top={`${AIR_TOP * 100}%`}
                bottom={`${groundHeight}%`}
                bg="dark.6"
              >
                <Text size="xs" c="gray.5">
                  AIR
                </Text>
              </Center>
              {projection && (
                <>
                  <GroundBand height={groundHeight} projection={projection} />
                  <JudgmentLine projection={projection} />
                </>
              )}
            </Box>
          </AspectRatio>
        }
      >
        <div
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setHovered(true);
          }}
          onPointerLeave={() => setHovered(false)}
          onPointerDown={(event) => {
            if (disabled || !event.isPrimary || event.button !== 0) return;
            (event.target as Element).setPointerCapture(event.pointerId);
            setKeyboardFocus(false);
            setPressed(true);
          }}
          onLostPointerCapture={(event) => {
            if (event.isPrimary) setPressed(false);
          }}
          onFocus={(event) => setKeyboardFocus(event.target.matches(":focus-visible"))}
          onKeyDownCapture={() => setKeyboardFocus(true)}
          onBlur={() => setKeyboardFocus(false)}
        >
          <OptionSlider
            label="地键区域高度"
            value={String(groundHeight)}
            options={groundHeights}
            markValue={String(GROUND_HEIGHT.default)}
            disabled={disabled}
            onChange={(value) => setOptions({ groundHeight: Number(value) })}
          />
        </div>
      </Tooltip>
      {frame &&
        projection &&
        createPortal(<GroundBand ref={ref} height={groundHeight} projection={projection} />, frame)}
    </>
  );
}
