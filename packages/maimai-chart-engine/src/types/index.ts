/**
 * 滑条类型
 * - `-`: 直线
 * - `>`: 顺时针弧线（从左侧开始）
 * - `<`: 逆时针弧线（从左侧开始）
 * - `^`: 短弧线（取较短路径）
 * - `v`: V 形穿过中心
 * - `p`: 顺时针曲线
 * - `pp`: 顺时针曲线（双倍）
 * - `q`: 逆时针曲线
 * - `qq`: 逆时针曲线（双倍）
 * - `s`: S 形曲线（从左到右）
 * - `z`: Z 形曲线（从右到左）
 * - `w`: Wi-Fi 滑条（扇形图案）
 * - `V`: V 形带有中间点
 */
export type SlidePathType =
  | "-"
  | ">"
  | "<"
  | "^"
  | "v"
  | "p"
  | "pp"
  | "q"
  | "qq"
  | "s"
  | "z"
  | "w"
  | "V";

/**
 * 触摸判定区
 * - A1-A8: 外环判定区
 * - B1-B8: 内环判定区
 * - C1, C2: 中心判定区
 * - D1-D8: 按钮区域判定区
 * - E1-E8: 边缘判定区
 */
export type TouchPosition =
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6"
  | "A7"
  | "A8"
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "B7"
  | "B8"
  | "C"
  | "C1"
  | "C2"
  | "D1"
  | "D2"
  | "D3"
  | "D4"
  | "D5"
  | "D6"
  | "D7"
  | "D8"
  | "E1"
  | "E2"
  | "E3"
  | "E4"
  | "E5"
  | "E6"
  | "E7"
  | "E8";

/**
 * 按钮位置（1-8，顺时针从右上开始）
 */
export type ButtonPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * 镜像模式
 * - none: 无
 * - horizontal: 水平
 * - vertical: 垂直
 * - rotate180: 旋转180度
 */
export type MirrorMode = "none" | "horizontal" | "vertical" | "rotate180";

/**
 * 判定线显示
 * - blind: 无
 * - noLine: 判定点
 * - simple: 判定点 + 判定线
 * - sensor: 判定点 + 判定线 + 判定区
 */
export type JudgmentLineDesign = "blind" | "noLine" | "simple" | "sensor";

export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

export const DIFFICULTY_NAMES: Record<ChartDifficulty, string> = {
  1: "EASY",
  2: "BASIC",
  3: "ADVANCED",
  4: "EXPERT",
  5: "MASTER",
  6: "Re:MASTER",
};

export const DIFFICULTY_COLORS: Record<ChartDifficulty, string> = {
  1: "#1E3A8A",
  2: "#22C55E",
  3: "#EAB308",
  4: "#EF4444",
  5: "#A855F7",
  6: "#F8FAFC",
};

export interface SlideArcLutPoint {
  x: number;
  y: number;
  /** 入向切线角（rad） */
  angle: number;
  /** 累计弧长 */
  s: number;
}

export interface SlideSegment {
  /** 滑条路径类型 */
  type: SlidePathType;
  /** 起始按钮位置（1-8） */
  startPos: ButtonPosition;
  /** 结束按钮位置（1-8） */
  endPos: ButtonPosition;
  /** V（大写折返）滑条的拐点按钮（仅 type==="V" 时存在），detectSlideShape 用它判 L/R 侧 */
  midPos?: ButtonPosition;
  /** 缓存长度（懒计算） */
  cachedLength?: number;
  /** 缓存弧长 LUT（懒计算，star 头部按弧长定位） */
  cachedLut?: readonly SlideArcLutPoint[];
  /** 缓存对应的 canvas radius，size 变化（全屏切换/窗口 resize）时用于失效 */
  cachedRadius?: number;
  /** 缓存对应的 mirror mode，切换 mirror 时用于失效 */
  cachedMirrorMode?: string;
  /** 缓存 bar chain（懒计算，每帧不变；按 radius/mirror 失效，与 LUT 同源依赖） */
  cachedChain?: { x: number; y: number; angle: number }[];
  cachedChainRadius?: number;
  cachedChainMirror?: string;
}

export interface BaseNote {
  /** 按钮位置（1-8） */
  position: ButtonPosition | TouchPosition;
  /** 时间（拍） */
  timing: number;
  /** 时间（毫秒） */
  timingMs: number;
  /** 小节号（0-indexed in parser, 1-indexed after adjustment） */
  measure: number;
  /** 小节内位置（0-511） */
  positionInMeasure: number;
  /** 视觉缩放因子（用于接近动画） */
  scale: number;
  /** 此 Note 的时间 BPM */
  bpm: number;
  /** 此 Note 是否有延迟标记（simai 中的反引号） */
  hasDelayMarker?: boolean;
  /** 是否为绝赞 Note */
  isBreak?: boolean;
  /** 视觉流速倍率（simai `<HS*x>`），只缩放接近速度，不影响判定时刻 */
  hiSpeed?: number;
}

export interface TapNote extends BaseNote {
  type: "tap" | "simultaneous";
  position: ButtonPosition;
  /** 是否为星形 TAP（simai `$`） */
  isStar?: boolean;
  /** 星形 TAP 是否旋转（simai `$$`） */
  isSpinningStar?: boolean;
  /** 是否有保护套 */
  isEx?: boolean;
}

export interface HoldStartNote extends BaseNote {
  type: "hold-start" | "hold-start-simultaneous";
  position: ButtonPosition;
  /** 持续时间（拍） */
  duration: number;
  /** 是否为 Hold 开始 */
  isHoldStart: true;
  /** 是否有保护套 */
  isEx?: boolean;
}

export interface HoldEndNote extends BaseNote {
  type: "hold-end" | "hold-end-simultaneous";
  position: ButtonPosition;
  /** 对应的 Hold 开始时间（拍） */
  holdStartTiming: number;
  /** 是否为 Hold 结束 */
  isHoldEnd: true;
  /** 是否有保护套 */
  isEx?: boolean;
}

export interface SlideNote extends BaseNote {
  type: "slide";
  position: ButtonPosition;
  /** 是否隐藏滑条起始星星 */
  isHeadless?: boolean;
  /** 无头滑条 tracing star 显示方式：simai `?` 为 fade，`!` 为 pop */
  headlessMode?: "fade" | "pop";
  /** 每个滑条路径是否为绝赞 */
  pathBreaks?: boolean[];
  /** 是否有保护套 */
  isEx?: boolean;
  /** 持续时间（拍） */
  duration: number;
  /** 持续时间（毫秒） */
  durationMs: number;
  /** 滑条开始前的延迟时间（毫秒） */
  delayMs?: number;
  /** 滑条路径段 */
  slideSegments: SlideSegment[];
  /** 所有滑条路径段（用于分段滑条） */
  allSlideSegments?: SlideSegment[][];
  /** 所有持续时间（拍）（用于分段滑条） */
  allDurations?: number[];
  /** 所有持续时间（毫秒）（用于分段滑条） */
  allDurationMs?: number[];
  /** 所有延迟时间（毫秒）（用于分段滑条） */
  allDelayMs?: number[];
  /** 所有自定义长度（用于分段滑条） */
  allCustomLengths?: (number | null)[];
  /** 是否为分段滑条（多个滑条路径） */
  isSplitSlide?: boolean;
  /** 自定义显示长度 */
  customLength?: number | null;
}

export interface TouchNote extends BaseNote {
  type: "touch";
  position: TouchPosition;
  /** 是否有烟花效果 */
  hasFirework?: boolean;
}

export interface TouchHoldStartNote extends BaseNote {
  type: "touch-hold-start";
  position: TouchPosition;
  /** 持续时间（拍） */
  duration: number;
  /** 持续时间（毫秒） */
  durationMs: number;
  /** 是否有烟花效果 */
  hasFirework?: boolean;
  /** 是否为 Hold 开始 */
  isHoldStart: true;
}

export interface TouchHoldEndNote extends BaseNote {
  type: "touch-hold-end";
  position: TouchPosition;
  /** 对应的 Hold 开始时间（拍） */
  holdStartTiming: number;
  /** 是否有烟花效果 */
  hasFirework?: boolean;
  /** 是否为 Hold 结束 */
  isHoldEnd: true;
}

export type Note =
  | TapNote
  | HoldStartNote
  | HoldEndNote
  | SlideNote
  | TouchNote
  | TouchHoldStartNote
  | TouchHoldEndNote;

export interface BpmEvent {
  /** BPM 变化时间（拍） */
  timing: number;
  /** 新 BPM 值 */
  bpm: number;
}

export interface DivisorEvent {
  /** 拍子变化时间（拍） */
  timing: number;
  /** 新拍子值（例如：4, 8, 16, 20） */
  divisor: number;
}

export interface ChartLevels {
  lv_1?: string;
  lv_2?: string;
  lv_3?: string;
  lv_4?: string;
  lv_5?: string;
  lv_6?: string;
}

export interface ChartDesigners {
  des_1?: string;
  des_2?: string;
  des_3?: string;
  des_4?: string;
  des_5?: string;
  des_6?: string;
}

export interface AvailableDifficulties {
  1?: boolean;
  2?: boolean;
  3?: boolean;
  4?: boolean;
  5?: boolean;
  6?: boolean;
}

export interface Chart {
  /** 曲目标题 */
  title: string;
  /** 曲目艺术家 */
  artist: string;
  /** 谱师 */
  designer: string;
  /** 初始 BPM */
  bpm: number;
  /** 难度等级 */
  level: ChartLevels;
  /** 谱师 */
  designers: ChartDesigners;
  /** 选择难度 */
  difficulty?: ChartDifficulty;
  /** 可用难度 */
  availableDifficulties?: AvailableDifficulties;
  /** 总小节数 */
  measures: number;
  /** 所有 Note */
  notes: Note[];
  /** BPM 变化事件 */
  bpmEvents: BpmEvent[];
  /** 拍子变化事件 */
  divisorEvents: DivisorEvent[];
  /** 谱面正文起点在音频中的偏移（`&first`，毫秒） */
  firstMs?: number;
}

export interface ChartMetadata {
  /** 初始 BPM */
  bpm: number;
  /** 曲目标题 */
  title: string;
  /** 曲目艺术家 */
  artist: string;
  /** 谱师 */
  designer: string;
  /** 难度等级 */
  level: ChartLevels;
  /** 谱师 */
  designers: ChartDesigners;
  /** 可用难度 */
  availableDifficulties: AvailableDifficulties;
  /** 谱面内容 */
  inotes: Record<number, string>;
  /** 谱面正文起点在音频中的偏移（`&first`，秒） */
  firstSec?: number;
}

export interface NoteRenderPosition {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface RendererConfig {
  /** 谱面流速：3-9 */
  hiSpeed: number;
  /** 保持固定流速 */
  alwaysKeepHiSpeed: boolean;
  /** 播放速度：0.1-1.0 */
  playbackSpeed: number;
  /** 镜像模式：上下反、左右反、全反 */
  mirrorMode: MirrorMode;
  /** 是否高亮保护套 Note */
  highlightExNotes: boolean;
  /** 是否使用正常颜色显示绝赞滑条 */
  normalColorBreakSlide: boolean;
  /** 是否使用粉色显示滑条起点 */
  pinkSlideStart: boolean;
  /** 是否旋转滑条起点 */
  slideRotation: boolean;
  /** 判定线显示：无、判定点、判定线、判定区 */
  judgmentLineDesign: JudgmentLineDesign;
  /** 是否显示当前 BPM */
  showBpm: boolean;
  /** 是否显示当前绝赞位置 */
  showBreakIndex: boolean;
  /** 是否使用彩虹色显示当前 BPM */
  rainbowBpm: boolean;
  /** 是否使用 DDR 风格显示判定线 */
  ddrColorMode: boolean;
  /** 是否使用扩展 DDR 风格显示判定线 */
  ddrColorExtended: boolean;
  /** 是否显示烟花特效（touch `f` 标记） */
  showFireworks: boolean;
  /** 是否显示判定点打击特效（tap / hold 尾 / 星星头 / 绝赞） */
  showHitEffect: boolean;
  /** 背景视频亮度：dark 最暗，normal 适中，bright 全亮 */
  videoBrightness: "dark" | "normal" | "bright";
}

export interface AudioConfig {
  /** 是否启用正解音 */
  enabled: boolean;
  /** 是否启用长条结束音 */
  holdEndSoundEnabled: boolean;
  /** 是否启用触摸正解音 */
  touchSoundEnabled: boolean;
  /** 音量：0-1 */
  volume: number;
  /** 正解音延迟时间（毫秒） */
  timingOffsetMs: number;
}

export function isTapNote(note: Note): note is TapNote {
  return note.type === "tap" || note.type === "simultaneous";
}

export function isHoldStartNote(note: Note): note is HoldStartNote {
  return note.type === "hold-start" || note.type === "hold-start-simultaneous";
}

export function isHoldEndNote(note: Note): note is HoldEndNote {
  return note.type === "hold-end" || note.type === "hold-end-simultaneous";
}

export function isSlideNote(note: Note): note is SlideNote {
  return note.type === "slide";
}

export function isBreakNote(note: Note): boolean {
  return note.isBreak === true;
}

export function isSlidePathBreak(note: SlideNote, pathIndex: number): boolean {
  return note.pathBreaks?.[pathIndex] === true;
}

export function isTouchNote(note: Note): note is TouchNote {
  return note.type === "touch";
}

export function isTouchHoldStartNote(note: Note): note is TouchHoldStartNote {
  return note.type === "touch-hold-start";
}

export function isButtonNote(note: Note): boolean {
  return typeof note.position === "number" && note.position >= 1 && note.position <= 8;
}
