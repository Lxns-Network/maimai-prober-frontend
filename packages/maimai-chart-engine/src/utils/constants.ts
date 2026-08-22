/** Note 接近判定线基础时间（毫秒） */
export const BASE_APPROACH_TIME_MS = 2250;

/** 正解音基础偏移（毫秒） */
export const ANSWER_SOUND_BASE_OFFSET_MS = -50;

/** 默认 Note 超过判定线后不可见时间（毫秒） */
export const NOTE_VISIBILITY_AFTER_MS = 0;

/** 打击效果持续时间（毫秒） */
export const NOTE_HIT_EFFECT_DURATION_MS = 450;

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
export const SLIDE_ARROW_WIDTH_RATIO = 16.6 / 300;

/** 滑条箭头 V 形高度比例，越大 V 越张开 */
export const SLIDE_ARROW_HEIGHT_RATIO = 44.6 / 300;

/** 滑条箭头 V 形半展宽比例，越大前端顶点越突 */
export const SLIDE_ARROW_SPAN_RATIO = 12.2 / 300;

/** 滑条箭头沿走向前移偏移，使首颗箭头不贴起始判定点 */
export const SLIDE_ARROW_PADDING_RATIO = 9.5 / 300;

/** 滑条星星头大小比例（半径乘以该值），越大星星越大 */
export const SLIDE_STAR_SIZE_RATIO = 1.6 / 10.42;

/** 滑条星星头等待滑动时的初始大小比例 */
export const SLIDE_STAR_WAITING_MIN_SCALE = 0.5;

/** Wifi chevron 线宽比例 */
export const SLIDE_WIFI_LINE_WIDTH_RATIO = 19.2 / 300;

/** Wifi 11 颗 chevron 归一化位置分布，0→dFirst、1→dLast */
export const SLIDE_WIFI_CORNER_FRACS = [
  0, 0.094, 0.178, 0.266, 0.355, 0.462, 0.57, 0.674, 0.779, 0.884, 1,
];

/** 长条 Note 宽度比例 */
export const HOLD_WIDTH_RATIO = 1.5;

/** 长条 Note 内环比例 */
export const HOLD_INNER_RATIO = 0.62;

/**
 * Hold 被按住时整套动画的循环周期。波纹发射与本体明暗共用这一个时钟：
 * 实测实机录像里波纹每 16 帧（60fps）发射一轮且 2 秒内零漂移，本体亮度的周期是 15.90 帧，
 * 两者是同一个循环。注意它不是拍长（谱面 208 BPM → 288.5ms/拍），不要改成按 BPM 推算。
 */
export const HOLD_ACTIVE_CYCLE_MS = 16000 / 60;

/**
 * 一个循环内 hold 本体的亮度倍率（下标 = 距本轮首颗波纹的帧数，60fps，线性插值）。
 * 由实机录像逐帧测得（亮度 192↔234，同帧的静态 UI 条只波动 0.3，排除了编码/曝光的干扰），
 * 沿本体长度均匀变化，不是流动的高光。0 → 最暗，1 → 最亮。
 */
export const HOLD_ACTIVE_BRIGHTNESS_CURVE = [
  0.714, 0.51, 0.286, 0.095, 0, 0.01, 0.095, 0.293, 0.552, 0.762, 0.917, 0.976, 1, 0.995, 0.969,
  0.917,
];

/**
 * 本体亮度倍率的上下限，对应上面曲线的 0 与 1。
 * 实机的明暗比是 1.22（外框与渐变本体分别测得 1.15 / 1.18，是整条 note 一起变化）。
 * 这里把峰值定在 1.0 而不是 ±10% 居中：本体外框是纯白，倍率超过 1 会直接钳在 255，
 * 结果是亮的半个周期被削平、实际对比度掉到 1.11。以 1.0 封顶则完整保留 1.22 的对比度，
 * 且 note 最亮时的观感与不带呼吸时一致。
 */
export const HOLD_ACTIVE_BRIGHTNESS_MIN = 0.82;
export const HOLD_ACTIVE_BRIGHTNESS_MAX = 1;

/**
 * 按压中的 hold 头部辉光半径（占判定圈半径）。实机录像里头部有一团红色辉光，
 * 中心是接近白的热芯，到 0.034R 已是饱和色，0.05R 外被本体挡住。
 * 头部辉光本身不随循环闪烁（实测振幅 0.8/均值 134），只有本体会。
 */
export const HOLD_ACTIVE_GLOW_RATIO = 0.06;

/**
 * 头部辉光的颜色梯度，每项是 [位置, R 倍率, G 倍率, B 倍率]，倍率逐通道乘在 note 本色上。
 * 由实机 break hold 头部 105 帧平均后的径向剖面反解得到：R 掉得慢、G/B 掉得快，
 * 所以辉光从偏白的暖色芯很快过渡到饱和红，再拖一小段暗红。
 * 用逐通道倍率而不是"往某个红色 mix"，是因为单一双色混合会把 R 一起拉低，对不上实测。
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

/** 触摸 Note 接近时间乘数 */
export const TOUCH_APPROACH_MULTIPLIER = 0.9;

/** 触摸 Note 中心点大小比例 */
export const TOUCH_CENTER_DOT_RATIO = 1 / 37.5;

/** 触摸 Note 开放时花瓣距离 */
export const TOUCH_PETAL_OPEN_RATIO = 1 / 6.25;

/** 触摸 Note 关闭时花瓣距离 */
export const TOUCH_PETAL_CLOSED_RATIO = 1 / 12.5;

/**
 * 中心（C）touch hold 结束特效的朝向。C 落在判定圈圆心上，没有径向方向可用，
 * 实机在这里固定朝右上方，所以单独给一个角度；其余 sensor 用"指向圆心"。
 * -30° 是拿实机截图比对出来的：把同一套六边形转角估计器同时跑在截图和各候选角度的渲染上，
 * -30° 的偏差最小（4.7°，-45° 是 9.1°），肉眼看也只有 -30° 的六边形和实机一样是正立的。
 */
export const TOUCH_HOLD_CENTRE_BURST_ANGLE = -Math.PI / 6;

/** 触摸传感器半径（占 panel radius 的比例）。 */
export const TOUCH_SENSOR_RADII: Record<string, number> = {
  A: 0.854,
  B: 0.479,
  C: 0,
  D: 0.854,
  E: 0.625,
};

/** 默认流速 */
export const HI_SPEED_DEFAULT = 6;

/** 流速转换因子 */
export const HI_SPEED_CONVERSION_FACTOR = (2 / 3) * 0.9;

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

/** 彩虹 BPM 动画速度（每秒角度数） */
export const RAINBOW_SPEED_DEG_PER_SEC = 60;
