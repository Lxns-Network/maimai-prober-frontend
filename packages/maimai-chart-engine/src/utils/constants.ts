/** Note 接近判定线的基准时间（2250ms） */
export const BASE_APPROACH_TIME_MS = 2250;

/** 正解音基础偏移（-50ms） */
export const ANSWER_SOUND_BASE_OFFSET_MS = -50;

/** Note 穿过判定线后保留可见的时间（ms） */
export const NOTE_VISIBILITY_AFTER_MS = 0;

/** 打击命中特效持续时间（450ms） */
export const NOTE_HIT_EFFECT_DURATION_MS = 450;

/** 相邻按键间隔角度（45° = π/4） */
export const BUTTON_ANGLE_STEP = Math.PI / 4;

/** 1 号键起始角度偏移（22.5° = π/8） */
export const BUTTON_ANGLE_OFFSET = Math.PI / 8;

/** 顶部 12 点钟基准角度（-90° = -π/2） */
export const BASE_ANGLE = -Math.PI / 2;

/** 判定圈基准半径，context.radius 像素值对应的基准单位数，各渲染层共用。 */
export const PANEL_RADIUS_UNITS = 480;

/** Note 半径占判定圈半径的比例 */
export const NOTE_SIZE_RATIO = 1 / 12.5;

/** Tap Note 内环半径比例 */
export const TAP_INNER_RING_RATIO = 0.65;

/** Note 刚出现时的缩放比例 */
export const APPROACH_START_SCALE = 0.25;

/** 按键判定点标记半径比例 */
export const BUTTON_MARKER_RATIO = 9 / 300;

/** Note 轮廓线宽比例 */
export const NOTE_STROKE_WIDTH_RATIO = 2 / 300;

/** 判定线轮廓线宽比例 */
export const JUDGMENT_LINE_WIDTH_RATIO = 3 / 300;

/** 滑条箭头线宽比例 */
export const SLIDE_ARROW_WIDTH_RATIO = 16.6 / 300;

/** 滑条箭头 V 形开口高度比例 */
export const SLIDE_ARROW_HEIGHT_RATIO = 44.6 / 300;

/** 滑条箭头 V 形半展宽比例 */
export const SLIDE_ARROW_SPAN_RATIO = 12.2 / 300;

/** 滑条首颗箭头离起始按键的前移偏移比例（避免贴着起始判定点） */
export const SLIDE_ARROW_PADDING_RATIO = 9.5 / 300;

/** 滑条引导星半径比例 */
export const SLIDE_STAR_SIZE_RATIO = 1.6 / 10.42;

/** 滑条引导星等待起滑时的初始缩放比例 */
export const SLIDE_STAR_WAITING_MIN_SCALE = 0.5;

/** Wifi 滑条 chevron 线宽比例 */
export const SLIDE_WIFI_LINE_WIDTH_RATIO = 19.2 / 300;

/** Wifi 滑条 11 颗 chevron 的归一化位置分布（0 为首颗，1 为末颗） */
export const SLIDE_WIFI_CORNER_FRACS = [
  0, 0.094, 0.178, 0.266, 0.355, 0.462, 0.57, 0.674, 0.779, 0.884, 1,
];

/** Hold 宽度比例 */
export const HOLD_WIDTH_RATIO = 1.5;

/** Hold 内环半径比例 */
export const HOLD_INNER_RATIO = 0.62;

/**
 * Hold 被按住时的动画循环周期（ms）。波纹发射与本体明暗共用此时钟：
 * 录像测量中波纹每 16 帧（60fps）发射一轮且 2 秒内零漂移，本体亮度周期为 15.90 帧，
 * 两者为同一循环。注意该值非拍长（如 208 BPM 对应 288.5ms/拍），禁止按 BPM 换算。
 */
export const HOLD_ACTIVE_CYCLE_MS = 16000 / 60;

/**
 * 单个循环周期内 Hold 本体的亮度倍率（下标对应 60fps 帧偏移，线性插值）。
 * 录像测量逐帧测得（亮度 192↔234，同帧静态 UI 仅波动 0.3，排除了编码与曝光干扰）。
 * 亮度沿本体长度均匀变化，非流动高光。0 为最暗，1 为最亮。
 */
export const HOLD_ACTIVE_BRIGHTNESS_CURVE = [
  0.714, 0.51, 0.286, 0.095, 0, 0.01, 0.095, 0.293, 0.552, 0.762, 0.917, 0.976, 1, 0.995, 0.969,
  0.917,
];

/**
 * Hold 本体亮度倍率下限与上限，对应亮度和对比度曲线的 0 与 1。
 * 录像测量实测明暗比为 1.22（外框与渐变本体分别测得 1.15 和 1.18，整条音符同步变化）。
 * 峰值定为 1.0 而非居中缩放：本体外框为纯白，倍率超 1 会被截断在 255 导致亮部削平、
 * 对比度跌落至 1.11。封顶 1.0 可完整保留 1.22 对比度，且峰值观感与静态时一致。
 */
export const HOLD_ACTIVE_BRIGHTNESS_MIN = 0.82;
export const HOLD_ACTIVE_BRIGHTNESS_MAX = 1;

/**
 * 按压中的 Hold 头部辉光半径比例（占判定圈半径）。
 * 录像测量显示头部有一团红色辉光，中心接近白热芯，到 0.034R 已饱和，0.05R 外被本体遮挡。
 * 头部辉光本身不随循环闪烁（实测振幅 0.8 / 均值 134），只有本体呼吸。
 */
export const HOLD_ACTIVE_GLOW_RATIO = 0.06;

/**
 * 按压中的 Hold 头部辉光颜色梯度 [归一化半径位置, R, G, B 倍率]。
 * 由 Break Hold 头部 105 帧平均后的径向剖面反解得到：R 衰减慢、G/B 衰减快，
 * 因而由暖白芯迅速过渡到饱和红再到暗红。使用逐通道倍率而非单一颜色混合，
 * 是因为双色混合会把 R 通道一并拉低，无法吻合实测采样。
 */
export const HOLD_ACTIVE_GLOW_RAMP: readonly (readonly [number, number, number, number])[] = [
  [0, 0.99, 1.11, 1.29],
  [0.1, 0.99, 0.98, 1.04],
  [0.2, 0.99, 0.79, 0.72],
  [0.3, 0.98, 0.63, 0.62],
  [0.4, 0.93, 0.49, 0.62],
  [0.5, 0.76, 0.28, 0.43],
  [0.6, 0.54, 0.08, 0.13],
  [0.7, 0.41, 0.02, 0.05],
  [0.8, 0.3, 0.01, 0.04],
  [0.9, 0.24, 0.02, 0.05],
];

/** Touch Note 接近时间倍率（相对普通 Note 更快出现） */
export const TOUCH_APPROACH_MULTIPLIER = 0.9;

/** Touch Note 中心点半径比例 */
export const TOUCH_CENTER_DOT_RATIO = 1 / 37.5;

/** Touch Note 花瓣展开距离比例 */
export const TOUCH_PETAL_OPEN_RATIO = 1 / 6.25;

/** Touch Note 花瓣闭合距离比例 */
export const TOUCH_PETAL_CLOSED_RATIO = 1 / 12.5;

/**
 * 屏幕中心（C 区域）Touch Hold 结束特效固定朝向角（弧度）。
 * 中心点落在圆心上无径向方向可用，因而固定朝右上方（其余传感器朝向圆心）。
 * -30°（-π/6）来自录像采样截图对照：六边形转角估计器在截图与各候选角度上比对，
 * -30° 偏差最小（4.7°，-45° 为 9.1°），且仅有 -30° 下六边形呈正立外观。
 */
export const TOUCH_HOLD_CENTRE_BURST_ANGLE = -Math.PI / 6;

/** Touch 中心到圆心的距离，以判定圈基准半径归一化。 */
export const TOUCH_SENSOR_RADII: Record<string, number> = {
  A: 400 / PANEL_RADIUS_UNITS,
  B: 220 / PANEL_RADIUS_UNITS,
  C: 0,
  D: 410 / PANEL_RADIUS_UNITS,
  E: 310 / PANEL_RADIUS_UNITS,
};

/** 默认流速 */
export const HI_SPEED_DEFAULT = 6;

/** 流速换算因子 */
export const HI_SPEED_CONVERSION_FACTOR = (2 / 3) * 0.9;

/** 音符亮色混合比例 */
export const NOTE_LIGHTEN_RATIO = 0.18;

/** 节拍着色模式暗色混合比例 */
export const DDR_DARKEN_RATIO = 0.25;

/** 全局颜色常量 */
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

  TOUCH_CYAN: "#00FFFF",
  TOUCH_BLUE: "#0080FF",
  /** 双押 Touch 花瓣渐变起点；与 DDR_YELLOW 同值但用途无关，不可互换。 */
  TOUCH_SIMULTANEOUS_YELLOW: "#FFFF00",
  TOUCH_HOLD_RED: "#F74601",
  TOUCH_HOLD_YELLOW: "#F6ED00",
  TOUCH_HOLD_GREEN: "#12A86A",
  TOUCH_HOLD_BLUE: "#0097F6",

  EX_OVERLAY_BREAK: "rgba(255, 200, 120, 0.8)",
  EX_OVERLAY_SIMULTANEOUS: "rgba(255, 245, 150, 0.8)",
  EX_OVERLAY_NORMAL: "rgba(255, 180, 210, 0.8)",

  WHITE: "#ffffff",

  HIT_EFFECT_GOLD: "#F5EA72",

  // 节拍着色模式颜色映射（按拍位分频）
  DDR_RED: "#FF0000", // 1/1（节拍内）
  DDR_BLUE: "#0066FF", // 1/2
  DDR_YELLOW: "#FFFF00", // 1/4
  DDR_GREEN: "#00FF00", // 1/8+
  DDR_ORANGE: "#FF8800", // 1/8（扩展）
  DDR_CYAN: "#00DDFF", // 1/6（扩展）
} as const;

/** 彩虹 BPM 文本颜色旋转速度（度/秒） */
export const RAINBOW_SPEED_DEG_PER_SEC = 60;
