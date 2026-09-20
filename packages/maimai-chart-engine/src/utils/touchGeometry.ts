import type { MirrorMode, Point2D, TouchPosition } from "../types";
import {
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
  TOUCH_SENSOR_RADII,
} from "./constants";

/** 传感器编号的镜像映射，按对称轴分组；C 区落在圆心上不参与。 */
const SENSOR_MIRROR_MAPS: Record<string, Record<string, number[]>> = {
  horizontal: {
    AB: [0, 8, 7, 6, 5, 4, 3, 2, 1],
    DE: [0, 1, 8, 7, 6, 5, 4, 3, 2],
  },
  vertical: {
    AB: [0, 4, 3, 2, 1, 8, 7, 6, 5],
    DE: [0, 5, 4, 3, 2, 1, 8, 7, 6],
  },
  rotate180: {
    ABDE: [0, 5, 6, 7, 8, 1, 2, 3, 4],
  },
};

/** 按镜像模式转换 Touch 传感器位置（C 区不变，外圈按对称轴映射）。 */
export function mirrorTouchSensor(
  touchPosition: TouchPosition,
  mirrorMode: MirrorMode,
): TouchPosition {
  if (mirrorMode === "none") return touchPosition;

  const region = touchPosition[0];
  const sensorNum = touchPosition.length > 1 ? parseInt(touchPosition[1]) : 0;

  if (region === "C") {
    return touchPosition;
  }

  const map = SENSOR_MIRROR_MAPS[mirrorMode];
  if (!map) return touchPosition;

  const key = mirrorMode === "rotate180" ? "ABDE" : region === "A" || region === "B" ? "AB" : "DE";
  const mapping = map[key];
  if (!mapping) return touchPosition;

  return `${region}${mapping[sensorNum]}` as TouchPosition;
}

/** 判定圈几何，radius 为判定圈像素半径。 */
export interface TouchPanelGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  mirrorMode: MirrorMode;
}

/** Touch 传感器在画布上的像素坐标；先按镜像模式换算编号，再取该区域的半径与角度。 */
export function touchSensorPoint(
  touchPosition: TouchPosition,
  { centerX, centerY, radius, mirrorMode }: TouchPanelGeometry,
): Point2D {
  const mirrored = mirrorTouchSensor(touchPosition, mirrorMode);
  const region = mirrored[0];
  const sensorNum = mirrored.length > 1 ? parseInt(mirrored[1]) : 0;

  if (region === "C") {
    return { x: centerX, y: centerY };
  }

  const distance = radius * (TOUCH_SENSOR_RADII[region] || 0);
  // A/B 与按键对齐；D/E 位于相邻按键之间。
  const angle =
    region === "D" || region === "E"
      ? BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP
      : BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;

  return {
    x: centerX + Math.cos(angle) * distance,
    y: centerY + Math.sin(angle) * distance,
  };
}
