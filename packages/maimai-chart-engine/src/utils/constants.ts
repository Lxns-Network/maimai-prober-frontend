/** Note 接近判定线基础时间（毫秒） */
export const BASE_APPROACH_TIME_MS = 2250;

/** 标准拍子（4/4 拍子） */
export const BEATS_PER_MEASURE = 4;

/** 小节内位置分辨率（0-511） */
export const POSITION_TICKS_PER_MEASURE = 512;

/** 正解音基础偏移（毫秒） */
export const ANSWER_SOUND_BASE_OFFSET_MS = -50;

/** Note 声音播放窗口（毫秒） */
export const NOTE_PLAY_WINDOW_MS = 20;

/** 默认 Note 超过判定线后不可见时间（毫秒） */
export const NOTE_VISIBILITY_AFTER_MS = 0;

/** 打击效果持续时间（毫秒） */
export const NOTE_HIT_EFFECT_DURATION_MS = 450;

/** 圆圈周围按钮数量 */
export const BUTTON_COUNT = 8;

/** 相邻按钮之间的角度（弧度） */
export const BUTTON_ANGLE_STEP = Math.PI / 4;

/** 1 号键开始角度偏移（弧度） */
export const BUTTON_ANGLE_OFFSET = Math.PI / 8;

/** 基础角度（向上） */
export const BASE_ANGLE = -Math.PI / 2;

/** Note 圆圈大小比例 */
export const NOTE_SIZE_RATIO = 1 / 12.5;

/** 点击 Note 内环比例 */
export const TAP_INNER_RING_RATIO = 0.65;

/** Note 开始接近时大小比例 */
export const APPROACH_START_SCALE = 0.25;

/** 按钮位置标记大小比例 */
export const BUTTON_MARKER_RATIO = 9 / 300;

/** Note 线条宽度比例 */
export const NOTE_STROKE_WIDTH_RATIO = 2 / 300;

/** 判定线宽度比例 */
export const JUDGMENT_LINE_WIDTH_RATIO = 3 / 300;

/** 滑条箭头线宽 */
export const SLIDE_ARROW_WIDTH_RATIO = 16 / 300;

/** 滑条箭头 V 形高度比例，越大 V 越张开 */
export const SLIDE_ARROW_HEIGHT_RATIO = 45.6 / 300;

/** 滑条箭头 V 形半展宽比例，越大前端顶点越突 */
export const SLIDE_ARROW_SPAN_RATIO = 11.52 / 300;

/** 滑条星星头大小比例（半径乘以该值），越大星星越大 */
export const SLIDE_STAR_SIZE_RATIO = 1.6 / 10.42;

/** 滑条箭头间距比例 */
export const SLIDE_ARROW_SPACING_RATIO = 26.896180742334582 / 300;

/** Wifi chevron 线宽比例 */
export const SLIDE_WIFI_LINE_WIDTH_RATIO = 19.2 / 300;

/** 滑条 S/Z 曲线偏移比例 */
export const SLIDE_CURVE_OFFSET_RATIO = 0.4;

/** 长条 Note 宽度比例 */
export const HOLD_WIDTH_RATIO = 1.5;

/** 长条 Note 内环比例 */
export const HOLD_INNER_RATIO = 0.62;

/** 触摸 Note 接近时间乘数 */
export const TOUCH_APPROACH_MULTIPLIER = 0.9;

/** 触摸 Note 中心点大小比例 */
export const TOUCH_CENTER_DOT_RATIO = 1 / 37.5;

/** 触摸 Note 开放时花瓣距离 */
export const TOUCH_PETAL_OPEN_RATIO = 1 / 6.25;

/** 触摸 Note 关闭时花瓣距离 */
export const TOUCH_PETAL_CLOSED_RATIO = 1 / 12.5;

/** 触摸 Hold 进度条宽度比例 */
export const TOUCH_HOLD_PROGRESS_WIDTH_RATIO = 1 / 31.25;

/** 触摸传感器半径（占 panel radius 的比例）。 */
export const TOUCH_SENSOR_RADII: Record<string, number> = {
  A: 0.854,
  B: 0.479,
  C: 0,
  D: 0.854,
  E: 0.625,
};

/** 最慢流速 */
export const HI_SPEED_MIN = 3;

/** 最快流速 */
export const HI_SPEED_MAX = 9;

/** 默认流速 */
export const HI_SPEED_DEFAULT = 6;

/** 流速转换因子 */
export const HI_SPEED_CONVERSION_FACTOR = (2 / 3) * 0.9;

/** 最小播放速度 */
export const PLAYBACK_SPEED_MIN = 0.1;

/** 最大播放速度 */
export const PLAYBACK_SPEED_MAX = 1.0;

/** 默认播放速度 */
export const PLAYBACK_SPEED_DEFAULT = 1.0;

/** 音符亮色混合比例（lighten） */
export const NOTE_LIGHTEN_RATIO = 0.18;

/** DDR 模式暗色混合比例 */
export const DDR_DARKEN_RATIO = 0.25;

export const COLORS = {
  BLACK: "#000000",
  TAP_PINK: "#ff69b4",
  TAP_GRADIENT_START: "#FD197D",
  TAP_GRADIENT_END: "#FF7DD5",
  SIMULTANEOUS_GOLD: "#FFD700",
  SIMULTANEOUS_GRADIENT_START: "#FCB600",
  SIMULTANEOUS_GRADIENT_END: "#FFFE00",
  BREAK_ORANGE: "#FF8C00",
  BREAK_GRADIENT_START: "#FFB347",
  BREAK_GRADIENT_END: "#FF6600",

  SLIDE_CYAN: "#01FBFD",
  SLIDE_ARROW_RIGHT: "#FF9001",
  SLIDE_PINK: "#ff69b4",
  SLIDE_SIMULTANEOUS: "#FFED24",

  HOLD_PINK: "#ff69b4",
  HOLD_BREAK: "#FF8C00",

  TOUCH_CYAN: "#00FFFF",
  TOUCH_BLUE: "#0080FF",
  TOUCH_SIMULTANEOUS: "#FFD700",
  TOUCH_HOLD_RED: "#FF6B6B",
  TOUCH_HOLD_YELLOW: "#FFE66D",
  TOUCH_HOLD_GREEN: "#2ECC71",
  TOUCH_HOLD_BLUE: "#3498DB",

  EX_OVERLAY_BREAK: "rgba(255, 200, 120, 0.8)",
  EX_OVERLAY_SIMULTANEOUS: "rgba(255, 245, 150, 0.8)",
  EX_OVERLAY_NORMAL: "rgba(255, 180, 210, 0.8)",

  WHITE: "#ffffff",
  CONNECTOR_GOLD: "#FFD700",

  HIT_EFFECT_GOLD: "#F5EA72",

  // DDR 判定颜色
  DDR_RED: "#FF0000", // 1/1（节拍内）
  DDR_BLUE: "#0066FF", // 1/2
  DDR_YELLOW: "#FFFF00", // 1/4
  DDR_GREEN: "#00FF00", // 1/8+
  DDR_ORANGE: "#FF8800", // 1/8（扩展）
  DDR_CYAN: "#00DDFF", // 1/6（扩展）
} as const;

/** 淡入效果持续时间（毫秒） */
export const FADE_IN_DURATION_MS = 150;

/** 彩虹 BPM 动画速度（每秒角度数） */
export const RAINBOW_SPEED_DEG_PER_SEC = 60;

/** 渲染顺序 */
export const RENDER_ORDER = {
  JUDGMENT_LINE: 0,
  SLIDE_TRACKS: 1,
  SLIDE_TRACKS_STARS: 2,
  CONNECTORS: 3,
  HOLD_NOTES: 4,
  TOUCH_NOTES: 5,
  SLIDE_STARTS: 6,
  TAP_NOTES: 7,
  UI_OVERLAY: 8,
} as const;
