/**
 * 滑条路径类型（simai 语法记号）：
 * - `-`: 直线
 * - `>`: 顺时针外圈圆弧
 * - `<`: 逆时针外圈圆弧
 * - `^`: 两点间较短圆弧
 * - `v`: 穿过圆心的折线
 * - `p` / `pp`: 顺时针回旋曲线（pp 为双倍）
 * - `q` / `qq`: 逆时针回旋曲线（qq 为双倍）
 * - `s`: S 形平滑曲线
 * - `z`: 反向 Z 形平滑曲线
 * - `w`: 扇形 Wi-Fi 滑条
 * - `V`: 经由指定拐点的折线
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
 * 屏幕触摸传感器分区（A1~A8 外环、B1~B8 内环、C/C1/C2 中心、D1~D8 按键内侧、E1~E8 边缘）。
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
 * 外圈按键方位编号（1 ~ 8，右上 1 号键起顺时针排列）。
 */
export type ButtonPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** 谱面镜像模式（无镜像、左右翻转、上下翻转、旋转 180 度）。 */
export type MirrorMode = "none" | "horizontal" | "vertical" | "rotate180";

/**
 * 判定线显示样式：
 * - `blind`: 隐藏判定线与判定点
 * - `noLine`: 仅显示判定点
 * - `simple`: 判定点 + 外圈判定线
 * - `sensor`: 判定点 + 外圈线 + 触摸传感器分区
 */
export type JudgmentLineDesign = "blind" | "noLine" | "simple" | "sensor";

/** 谱面难度编号（1: EASY ~ 6: Re:MASTER）。 */
export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

/** 各难度显示名称 */
export const DIFFICULTY_NAMES: Record<ChartDifficulty, string> = {
  1: "EASY",
  2: "BASIC",
  3: "ADVANCED",
  4: "EXPERT",
  5: "MASTER",
  6: "Re:MASTER",
};

/** 各难度主题色 */
export const DIFFICULTY_COLORS: Record<ChartDifficulty, string> = {
  1: "#1E3A8A",
  2: "#22C55E",
  3: "#EAB308",
  4: "#EF4444",
  5: "#A855F7",
  6: "#F8FAFC",
};

/**
 * 滑条路径采样查找表（LUT）中的离散点。
 */
export interface SlideArcLutPoint {
  /** 画布像素 X 坐标 */
  x: number;
  /** 画布像素 Y 坐标 */
  y: number;
  /** 该点的切线角度（rad） */
  angle: number;
  /** 从起点到该点的累计弧长（px） */
  s: number;
}

/**
 * 单段滑条的几何参数与采样缓存。
 */
export interface SlideSegment {
  type: SlidePathType;
  startPos: ButtonPosition;
  endPos: ButtonPosition;
  /** 折线滑条（V）的拐点按键（1~8） */
  midPos?: ButtonPosition;
  /** 缓存的滑条总弧长（px，半径或镜像变化时失效） */
  cachedLength?: number;
  /** 引导星插值定位用的弧长采样表（LUT，半径或镜像变化时失效） */
  cachedLut?: readonly SlideArcLutPoint[];
  /** 缓存 LUT 时记录的判定圈半径，用于尺寸变化时失效 */
  cachedRadius?: number;
  /** 缓存 LUT 时记录的镜像模式，用于镜像变化时失效 */
  cachedMirrorMode?: string;
  /** 缓存的引导箭头点位和角度序列（半径或镜像变化时失效） */
  cachedChain?: { x: number; y: number; angle: number }[];
  /** 缓存引导点序列时的判定圈半径，用于失效判定 */
  cachedChainRadius?: number;
  /** 缓存引导点序列时的镜像模式，用于失效判定 */
  cachedChainMirror?: string;
}

/**
 * 所有 Note 的基础字段。
 */
export interface BaseNote {
  /** 按键方位（1~8）或触摸传感器区域 */
  position: ButtonPosition | TouchPosition;
  /** 判定时刻（拍） */
  timing: number;
  /** 判定时刻（ms） */
  timingMs: number;
  /** 小节序号（解析阶段为 0 起始，后处理后转为 1 起始） */
  measure: number;
  /** 小节内细分位置（0~511，基于 512 分音符解析度） */
  positionInMeasure: number;
  /** 进场缩放倍率 */
  scale: number;
  /** 该时刻的 BPM */
  bpm: number;
  /** 是否有延迟起滑/等待标记 */
  hasDelayMarker?: boolean;
  /** 局部流速倍率（仅缩放进场速度，不改变判定时刻） */
  hiSpeed?: number;
}

/**
 * Tap 音符（普通 Tap、Break 或同压）。
 */
export interface TapNote extends BaseNote {
  type: "tap" | "break" | "simultaneous";
  position: ButtonPosition;
  /** 是否显示为星星外观 */
  isStar?: boolean;
  /** 星星是否持续自转 */
  isSpinningStar?: boolean;
  /** 是否为 EX 音符（带发光外环） */
  isEx?: boolean;
}

/**
 * Hold 起始端数据。
 */
export interface HoldStartNote extends BaseNote {
  type: "hold-start" | "hold-start-simultaneous";
  position: ButtonPosition;
  /** Hold 持续时长（拍） */
  duration: number;
  isHoldStart: true;
  /** 是否为 EX 音符（带发光外环） */
  isEx?: boolean;
  /** 是否为 Break Hold */
  isBreakHold?: boolean;
}

/**
 * Hold 结束端数据。
 */
export interface HoldEndNote extends BaseNote {
  type: "hold-end" | "hold-end-simultaneous";
  position: ButtonPosition;
  /** 对应 Hold 起始端的判定时刻（拍） */
  holdStartTiming: number;
  isHoldEnd: true;
  /** 是否为 EX 音符（带发光外环） */
  isEx?: boolean;
  /** 是否为 Break Hold */
  isBreakHold?: boolean;
}

/**
 * Slide 音符，包含引导头、轨迹路径段和时序配置。
 */
export interface SlideNote extends BaseNote {
  type: "slide";
  position: ButtonPosition;
  /** 是否隐藏起点引导星（无头 Slide） */
  isHeadless?: boolean;
  /** 无头 Slide 引导星出现方式："fade" 淡入，"pop" 弹出 */
  headlessMode?: "fade" | "pop";
  /** 起点是否显示为普通 Tap 外观而非星星（isHeadless 时无效） */
  hasTapHead?: boolean;
  /** 起点是否为 Break */
  isStartBreak?: boolean;
  /** 并发多滑条时，各条路径是否分别为 Break */
  allSlideBreaks?: boolean[];
  /** 是否为 EX 音符（带发光外环） */
  isEx?: boolean;
  /** 滑行时长（拍） */
  duration: number;
  /** 滑行时长（ms） */
  durationMs: number;
  /** 到达判定线后到起滑前的等待延迟（ms） */
  delayMs?: number;
  /** 第一条滑条的路径段 */
  slideSegments: SlideSegment[];
  /** 各并发滑条的路径段（多滑条场景） */
  allSlideSegments?: SlideSegment[][];
  /** 各并发滑条的滑行时长（拍） */
  allDurations?: number[];
  /** 各并发滑条的滑行时长（ms） */
  allDurationMs?: number[];
  /** 各并发滑条的等待延迟（ms） */
  allDelayMs?: number[];
  /** 各并发滑条的自定义显示长度比例 */
  allCustomLengths?: (number | null)[];
  /** 是否包含多条同时起动的并发滑条 */
  isSplitSlide?: boolean;
  /** 自定义显示长度比例（null 为完整路径） */
  customLength?: number | null;
}

/**
 * Touch 音符。
 */
export interface TouchNote extends BaseNote {
  type: "touch";
  position: TouchPosition;
  /** 是否附带烟花特效（simai f 标记） */
  hasFirework?: boolean;
}

/**
 * Touch Hold 起始端数据。
 */
export interface TouchHoldStartNote extends BaseNote {
  type: "touch-hold-start";
  position: TouchPosition;
  /** Hold 持续时长（拍） */
  duration: number;
  /** Hold 持续时长（ms） */
  durationMs: number;
  /** 是否附带烟花特效（simai f 标记） */
  hasFirework?: boolean;
  isHoldStart: true;
}

/**
 * Touch Hold 结束端数据。
 */
export interface TouchHoldEndNote extends BaseNote {
  type: "touch-hold-end";
  position: TouchPosition;
  /** 对应 Hold 起始端的判定时刻（拍） */
  holdStartTiming: number;
  /** 是否附带烟花特效（simai f 标记） */
  hasFirework?: boolean;
  isHoldEnd: true;
}

/** 所有音符对象的联合类型 */
export type Note =
  | TapNote
  | HoldStartNote
  | HoldEndNote
  | SlideNote
  | TouchNote
  | TouchHoldStartNote
  | TouchHoldEndNote;

/** BPM 变更事件 */
export interface BpmEvent {
  /** 发生变更的时刻（拍） */
  timing: number;
  /** 变更后的 BPM */
  bpm: number;
}

/** 节拍分频变更事件 */
export interface DivisorEvent {
  /** 发生变更的时刻（拍） */
  timing: number;
  /** 变更后的小节分频数（如 4、8、16、20 等） */
  divisor: number;
}

/** 各难度等级文本映射（lv_1 ~ lv_6 对应难度编号 1 ~ 6） */
export interface ChartLevels {
  lv_1?: string;
  lv_2?: string;
  lv_3?: string;
  lv_4?: string;
  lv_5?: string;
  lv_6?: string;
}

/** 各难度谱师名称映射（des_1 ~ des_6 对应难度编号 1 ~ 6） */
export interface ChartDesigners {
  des_1?: string;
  des_2?: string;
  des_3?: string;
  des_4?: string;
  des_5?: string;
  des_6?: string;
}

/** 各难度可用状态（key 为难度编号 1 ~ 6） */
export interface AvailableDifficulties {
  1?: boolean;
  2?: boolean;
  3?: boolean;
  4?: boolean;
  5?: boolean;
  6?: boolean;
}

/**
 * 完整解析后的谱面数据。
 */
export interface Chart {
  title: string;
  artist: string;
  designer: string;
  /** 初始 BPM */
  bpm: number;
  level: ChartLevels;
  designers: ChartDesigners;
  difficulty?: ChartDifficulty;
  availableDifficulties?: AvailableDifficulties;
  /** 总小节数 */
  measures: number;
  /** 所有音符列表 */
  notes: Note[];
  /** 按节拍时刻排序的 BPM 变更事件 */
  bpmEvents: BpmEvent[];
  /** 按节拍时刻排序的节拍分频变更事件 */
  divisorEvents: DivisorEvent[];
  /** 谱面正文起点在音频中的偏移（&first，ms） */
  firstMs?: number;
}

/**
 * 谱面全局元数据（包含各难度未解析的原始谱面文本）。
 */
export interface ChartMetadata {
  /** 初始 BPM */
  bpm: number;
  title: string;
  artist: string;
  designer: string;
  level: ChartLevels;
  designers: ChartDesigners;
  availableDifficulties: AvailableDifficulties;
  /** 各难度原始谱面文本（键为难度编号 1 ~ 6） */
  inotes: Record<number, string>;
  /** 谱面正文起点在音频中的偏移（&first，s） */
  firstSec?: number;
}

/**
 * 音符在特定渲染帧中的屏幕坐标与可视状态。
 */
export interface NoteRenderPosition {
  x: number;
  y: number;
  /** 当前缩放倍率 */
  scale: number;
  /** 是否处于可见进场范围 */
  visible: boolean;
}

/**
 * 二维平面坐标点（px）。
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 渲染器全局视觉与播放配置。
 */
export interface RendererConfig {
  /** 基准流速倍率（通常 3.0 ~ 9.0） */
  hiSpeed: number;
  /** 调整播放倍速时是否保持固定进场速度（自动补偿倍速） */
  alwaysKeepHiSpeed: boolean;
  /** 星星轨迹出现时机（-1.0 最早 ~ 1.0 最晚，步长 0.1，不改变判定时刻） */
  slideDelay: number;
  /** 播放速度倍率（0.1 ~ 1.0） */
  playbackSpeed: number;
  mirrorMode: MirrorMode;
  /** 是否高亮带发光外环的 EX 音符 */
  highlightExNotes: boolean;
  /** 是否用常规颜色显示 Break 滑条（而非黄色） */
  normalColorBreakSlide: boolean;
  /** 是否将滑条起点显示为粉色 */
  pinkSlideStart: boolean;
  /** 滑条起点的星星是否随时间自转 */
  slideRotation: boolean;
  judgmentLineDesign: JudgmentLineDesign;
  /** 是否显示实时 BPM */
  showBpm: boolean;
  /** 是否显示 Note 总数 */
  showNoteTotal: boolean;
  /** 是否显示 Break 总数 */
  showBreakCount: boolean;
  /** 是否在 Break 上显示打击序号 */
  showBreakIndex: boolean;
  /** 是否以彩虹色显示 BPM */
  rainbowBpm: boolean;
  /** 是否启用按拍位分频的着色模式（1/1、1/2、1/4 等） */
  ddrColorMode: boolean;
  /** 是否启用扩展拍位着色模式（额外区分 1/8、1/6 等） */
  ddrColorExtended: boolean;
  /** 是否显示 Touch 烟花特效 */
  showFireworks: boolean;
  /** 是否显示打击命中特效（Tap / Hold 尾 / 引导星 / Break） */
  showHitEffect: boolean;
}

/**
 * 击打音效播放配置。
 */
export interface AudioConfig {
  /** 是否启用击打音效 */
  enabled: boolean;
  /** 是否启用 Hold 结束音效 */
  holdEndSoundEnabled: boolean;
  /** 是否启用 Touch 击打音效 */
  touchSoundEnabled: boolean;
  /** 音量（0 ~ 1） */
  volume: number;
  /** 音效播放时间偏移（ms，正数延迟，负数提前） */
  timingOffsetMs: number;
}

/** 判断音符是否为点按类（tap、break、simultaneous） */
export function isTapNote(note: Note): note is TapNote {
  return note.type === "tap" || note.type === "break" || note.type === "simultaneous";
}

/** 判断音符是否为 Hold 起始端（hold-start、hold-start-simultaneous） */
export function isHoldStartNote(note: Note): note is HoldStartNote {
  return note.type === "hold-start" || note.type === "hold-start-simultaneous";
}

/** 判断音符是否为 Hold 结束端（hold-end、hold-end-simultaneous） */
export function isHoldEndNote(note: Note): note is HoldEndNote {
  return note.type === "hold-end" || note.type === "hold-end-simultaneous";
}

/** 判断音符是否为滑条（slide） */
export function isSlideNote(note: Note): note is SlideNote {
  return note.type === "slide";
}

/** 判断音符是否为 Touch 音符（touch） */
export function isTouchNote(note: Note): note is TouchNote {
  return note.type === "touch";
}

/** 判断音符是否为 Touch Hold 起始端（touch-hold-start） */
export function isTouchHoldStartNote(note: Note): note is TouchHoldStartNote {
  return note.type === "touch-hold-start";
}

/** 判断音符方位是否属于外圈 1~8 号按键（区别于屏幕触摸传感器） */
export function isButtonNote(note: Note): boolean {
  return typeof note.position === "number" && note.position >= 1 && note.position <= 8;
}
