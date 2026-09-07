/**
 * 滑条路径类型
 * - `-`: 直线
 * - `>`: 顺时针圆弧（沿外圆周）
 * - `<`: 逆时针圆弧（沿外圆周）
 * - `^`: 较短圆弧（沿两点间较短路径）
 * - `v`: 穿心折线（经由中心点）
 * - `p`: 顺时针大回旋曲线
 * - `pp`: 顺时针大回旋曲线（双倍旋转）
 * - `q`: 逆时针大回旋曲线
 * - `qq`: 逆时针大回旋曲线（双倍旋转）
 * - `s`: S 形平滑曲线
 * - `z`: 反向 Z 形平滑曲线
 * - `w`: 扇形展开滑条
 * - `V`: 折线（经由指定拐点）
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
 * 屏幕触摸传感器判定区标识
 * - A1 ~ A8: 外环判定区
 * - B1 ~ B8: 内环判定区
 * - C, C1, C2: 屏幕中心判定区
 * - D1 ~ D8: 按键内侧区域判定区
 * - E1 ~ E8: 屏幕边缘区域判定区
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
 * 外圈按键方位编号（1 ~ 8，以右上 1 号键为起点顺时针排列）。
 */
export type ButtonPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * 谱面镜像变换模式
 * - none: 正常显示（不镜像）
 * - horizontal: 左右镜像翻转
 * - vertical: 上下镜像翻转
 * - rotate180: 旋转 180 度
 */
export type MirrorMode = "none" | "horizontal" | "vertical" | "rotate180";

/**
 * 判定线视觉显示样式
 * - blind: 完全隐藏判定线与判定点
 * - noLine: 仅显示按键判定点
 * - simple: 显示判定点与判定外圈圆线
 * - sensor: 显示判定点、判定外圈及触摸传感器分区
 */
export type JudgmentLineDesign = "blind" | "noLine" | "simple" | "sensor";

/**
 * 谱面难度编号（1: EASY, 2: BASIC, 3: ADVANCED, 4: EXPERT, 5: MASTER, 6: Re:MASTER）。
 */
export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 谱面难度编号对应的显示文本名称映射表。
 */
export const DIFFICULTY_NAMES: Record<ChartDifficulty, string> = {
  1: "EASY",
  2: "BASIC",
  3: "ADVANCED",
  4: "EXPERT",
  5: "MASTER",
  6: "Re:MASTER",
};

/**
 * 谱面难度编号对应的主题色（十六进制颜色值）映射表。
 */
export const DIFFICULTY_COLORS: Record<ChartDifficulty, string> = {
  1: "#1E3A8A",
  2: "#22C55E",
  3: "#EAB308",
  4: "#EF4444",
  5: "#A855F7",
  6: "#F8FAFC",
};

/**
 * 滑条圆弧查找表（LUT）中的离散几何采样点。
 */
export interface SlideArcLutPoint {
  /** 采样点画布 X 像素坐标 */
  x: number;
  /** 采样点画布 Y 像素坐标 */
  y: number;
  /** 入向切线角（弧度） */
  angle: number;
  /** 自起点沿曲线至当前点的累计弧长（像素） */
  s: number;
}

/**
 * 单段滑条的几何路径参数与采样缓存数据。
 */
export interface SlideSegment {
  /** 滑条路径类型 */
  type: SlidePathType;
  /** 起始按键方位（1 ~ 8） */
  startPos: ButtonPosition;
  /** 结束按键方位（1 ~ 8） */
  endPos: ButtonPosition;
  /** V 形折返滑条的拐点按键方位（仅当 type === "V" 时有效，用于确定折角朝向） */
  midPos?: ButtonPosition;
  /** 缓存的滑条总弧长（像素，依赖当前画布半径与镜像模式） */
  cachedLength?: number;
  /** 缓存的弧长采样查找表（用于引导星沿路径插值定位，依赖当前画布半径与镜像模式） */
  cachedLut?: readonly SlideArcLutPoint[];
  /** 缓存弧长 LUT 时所记录的画布判定圈半径；尺寸变化时用于使缓存失效 */
  cachedRadius?: number;
  /** 缓存弧长 LUT 时所记录的镜像模式；镜像配置变化时用于使缓存失效 */
  cachedMirrorMode?: string;
  /** 缓存的滑条引导点坐标与切角序列（依赖当前画布半径与镜像模式） */
  cachedChain?: { x: number; y: number; angle: number }[];
  /** 缓存引导点序列时所记录的画布判定圈半径；尺寸变化时用于使缓存失效 */
  cachedChainRadius?: number;
  /** 缓存引导点序列时所记录的镜像模式；镜像配置变化时用于使缓存失效 */
  cachedChainMirror?: string;
}

/**
 * 基础音符数据结构，包含所有类型音符共有的位置、时间与动画缩放属性。
 */
export interface BaseNote {
  /** 音符所在位置（按键方位 1 ~ 8 或屏幕触摸传感器标识） */
  position: ButtonPosition | TouchPosition;
  /** 判定时刻（拍） */
  timing: number;
  /** 判定时刻（毫秒） */
  timingMs: number;
  /** 小节序号（解析阶段为 0 起始，完成调整后为 1 起始） */
  measure: number;
  /** 小节内节拍细分位置（0 ~ 511） */
  positionInMeasure: number;
  /** 视觉缩放比例（用于进场接近动画） */
  scale: number;
  /** 音符判定时刻所处的基准 BPM */
  bpm: number;
  /** 是否具有延迟等待标记（表示滑条或音符延迟起动） */
  hasDelayMarker?: boolean;
  /** 视觉流速倍率，仅缩放进场接近速度，不影响判定时刻 */
  hiSpeed?: number;
}

/**
 * 点按音符（TAP / BREAK / 双押）。
 */
export interface TapNote extends BaseNote {
  /** 音符类型：普通点按（"tap"）、绝赞（"break"）或同压点按（"simultaneous"） */
  type: "tap" | "break" | "simultaneous";
  /** 目标按键方位（1 ~ 8） */
  position: ButtonPosition;
  /** 是否以星星外观显示 */
  isStar?: boolean;
  /** 星形音符是否持续自转 */
  isSpinningStar?: boolean;
  /** 是否为 EX 音符（外层带有发光判定环） */
  isEx?: boolean;
}

/**
 * Hold 音符（HOLD）的起始端数据。
 */
export interface HoldStartNote extends BaseNote {
  /** 音符类型：普通 Hold 起点（"hold-start"）或同压 Hold 起点（"hold-start-simultaneous"） */
  type: "hold-start" | "hold-start-simultaneous";
  /** 目标按键方位（1 ~ 8） */
  position: ButtonPosition;
  /** Hold 持续时间（拍） */
  duration: number;
  /** 标识该音符为 Hold 起点 */
  isHoldStart: true;
  /** 是否为 EX 音符（外层带有发光判定环） */
  isEx?: boolean;
  /** 是否为绝赞 Hold 音符 */
  isBreakHold?: boolean;
}

/**
 * Hold 音符（HOLD）的结束端数据。
 */
export interface HoldEndNote extends BaseNote {
  /** 音符类型：普通 Hold 终点（"hold-end"）或同压 Hold 终点（"hold-end-simultaneous"） */
  type: "hold-end" | "hold-end-simultaneous";
  /** 目标按键方位（1 ~ 8） */
  position: ButtonPosition;
  /** 对应 Hold 起始端的判定时刻（拍） */
  holdStartTiming: number;
  /** 标识该音符为 Hold 终点 */
  isHoldEnd: true;
  /** 是否为 EX 音符（外层带有发光判定环） */
  isEx?: boolean;
  /** 是否为绝赞 Hold 音符 */
  isBreakHold?: boolean;
}

/**
 * 滑条音符（SLIDE），包含引导头、轨迹路径段及滑动动画时序配置。
 */
export interface SlideNote extends BaseNote {
  type: "slide";
  /** 滑条起点的按键方位（1 ~ 8） */
  position: ButtonPosition;
  /** 是否隐藏滑条起点的引导星（无头滑条） */
  isHeadless?: boolean;
  /** 无头滑条引导星的出现方式："fade" 为淡入渐显，"pop" 为直接弹出 */
  headlessMode?: "fade" | "pop";
  /** 滑条起点是否绘制为普通点按外观而非星星头；当 isHeadless 为 true 时此项无效 */
  hasTapHead?: boolean;
  /** 滑条起点音符是否为绝赞 */
  isStartBreak?: boolean;
  /** 各条滑条路径是否分别为绝赞（并发多滑条场景） */
  allSlideBreaks?: boolean[];
  /** 是否为 EX 音符（外层带有发光判定环） */
  isEx?: boolean;
  /** 滑行持续时间（拍） */
  duration: number;
  /** 滑行持续时间（毫秒） */
  durationMs: number;
  /** 起点到达判定线后至滑条开始滑行前的等待延迟时间（毫秒） */
  delayMs?: number;
  /** 首条滑条包含的几何路径段列表 */
  slideSegments: SlideSegment[];
  /** 各并发滑条分别包含的几何路径段列表（并发多滑条场景） */
  allSlideSegments?: SlideSegment[][];
  /** 各并发滑条各自的滑行持续时间列表（拍） */
  allDurations?: number[];
  /** 各并发滑条各自的滑行持续时间列表（毫秒） */
  allDurationMs?: number[];
  /** 各并发滑条各自的起动等待延迟时间列表（毫秒） */
  allDelayMs?: number[];
  /** 各并发滑条各自的自定义显示长度比例列表 */
  allCustomLengths?: (number | null)[];
  /** 是否包含多条同时起动的并发滑条路径 */
  isSplitSlide?: boolean;
  /** 自定义滑条显示长度比例（为 null 时按完整路径显示） */
  customLength?: number | null;
}

/**
 * 屏幕触摸音符（TOUCH）。
 */
export interface TouchNote extends BaseNote {
  type: "touch";
  /** 触摸传感器区域标识 */
  position: TouchPosition;
  /** 是否附带烟花特效 */
  hasFirework?: boolean;
}

/**
 * Touch Hold 音符（TOUCH HOLD）的起始端数据。
 */
export interface TouchHoldStartNote extends BaseNote {
  type: "touch-hold-start";
  /** 触摸传感器区域标识 */
  position: TouchPosition;
  /** Hold 持续时间（拍） */
  duration: number;
  /** Hold 持续时间（毫秒） */
  durationMs: number;
  /** 是否附带烟花特效 */
  hasFirework?: boolean;
  /** 标识该音符为 Touch Hold 起点 */
  isHoldStart: true;
}

/**
 * Touch Hold 音符（TOUCH HOLD）的结束端数据。
 */
export interface TouchHoldEndNote extends BaseNote {
  type: "touch-hold-end";
  /** 触摸传感器区域标识 */
  position: TouchPosition;
  /** 对应 Hold 起始端的判定时刻（拍） */
  holdStartTiming: number;
  /** 是否附带烟花特效 */
  hasFirework?: boolean;
  /** 标识该音符为 Touch Hold 终点 */
  isHoldEnd: true;
}

/**
 * 谱面中所有音符对象的联合类型。
 */
export type Note =
  | TapNote
  | HoldStartNote
  | HoldEndNote
  | SlideNote
  | TouchNote
  | TouchHoldStartNote
  | TouchHoldEndNote;

/**
 * BPM 变更事件点。
 */
export interface BpmEvent {
  /** 发生变更的节拍时刻（拍） */
  timing: number;
  /** 变更后的 BPM 数值 */
  bpm: number;
}

/**
 * 节拍分频变更事件点。
 */
export interface DivisorEvent {
  /** 发生变更的节拍时刻（拍） */
  timing: number;
  /** 变更后的小节分频数（如 4、8、16、20 等，表示一小节分为多少等份） */
  divisor: number;
}

/**
 * 各难度等级文本映射表（键名 lv_1 ~ lv_6 对应难度编号 1 ~ 6）。
 */
export interface ChartLevels {
  lv_1?: string;
  lv_2?: string;
  lv_3?: string;
  lv_4?: string;
  lv_5?: string;
  lv_6?: string;
}

/**
 * 各难度谱师名称映射表（键名 des_1 ~ des_6 对应难度编号 1 ~ 6）。
 */
export interface ChartDesigners {
  des_1?: string;
  des_2?: string;
  des_3?: string;
  des_4?: string;
  des_5?: string;
  des_6?: string;
}

/**
 * 谱面可用难度有效性映射表（键为难度编号 1 ~ 6）。
 */
export interface AvailableDifficulties {
  1?: boolean;
  2?: boolean;
  3?: boolean;
  4?: boolean;
  5?: boolean;
  6?: boolean;
}

/**
 * 完整解析后的谱面数据对象。
 */
export interface Chart {
  /** 曲目标题 */
  title: string;
  /** 曲目艺术家 */
  artist: string;
  /** 当前选定难度的谱师名称 */
  designer: string;
  /** 初始 BPM */
  bpm: number;
  /** 各难度的等级文本映射表 */
  level: ChartLevels;
  /** 各难度的谱师名称映射表 */
  designers: ChartDesigners;
  /** 当前选定的难度编号 */
  difficulty?: ChartDifficulty;
  /** 谱面包含的可用难度集合 */
  availableDifficulties?: AvailableDifficulties;
  /** 总小节数 */
  measures: number;
  /** 谱面包含的所有音符列表 */
  notes: Note[];
  /** 按节拍时刻排序的 BPM 变更事件列表 */
  bpmEvents: BpmEvent[];
  /** 按节拍时刻排序的节拍分频变更事件列表 */
  divisorEvents: DivisorEvent[];
  /** 谱面正文起点相对于音频开头的播放偏移时间（毫秒） */
  firstMs?: number;
}

/**
 * 谱面文件中提取的全局元数据（包含各难度未解析的原始谱面文本）。
 */
export interface ChartMetadata {
  /** 初始 BPM */
  bpm: number;
  /** 曲目标题 */
  title: string;
  /** 曲目艺术家 */
  artist: string;
  /** 谱师名称 */
  designer: string;
  /** 各难度的等级文本映射表 */
  level: ChartLevels;
  /** 各难度的谱师名称映射表 */
  designers: ChartDesigners;
  /** 谱面包含的可用难度集合 */
  availableDifficulties: AvailableDifficulties;
  /** 各难度编号对应的原始未解析谱面文本内容 */
  inotes: Record<number, string>;
  /** 谱面正文起点相对于音频开头的播放偏移时间（秒） */
  firstSec?: number;
}

/**
 * 音符在特定渲染帧中的屏幕坐标与可视状态。
 */
export interface NoteRenderPosition {
  /** 屏幕 X 像素坐标 */
  x: number;
  /** 屏幕 Y 像素坐标 */
  y: number;
  /** 当前渲染缩放倍率 */
  scale: number;
  /** 当前时刻是否处于可见进场范围 */
  visible: boolean;
}

/**
 * 二维平面坐标点。
 */
export interface Point2D {
  /** X 轴坐标（像素） */
  x: number;
  /** Y 轴坐标（像素） */
  y: number;
}

/**
 * 谱面渲染器的全局视觉与播放配置项。
 */
export interface RendererConfig {
  /** 基准视觉流速倍率（通常为 3.0 ~ 9.0） */
  hiSpeed: number;
  /** 是否在调整播放倍速时保持固定的音符进场速度（自动补偿播放倍速） */
  alwaysKeepHiSpeed: boolean;
  /** 播放速度倍率（0.1 ~ 1.0） */
  playbackSpeed: number;
  /** 谱面镜像变换模式 */
  mirrorMode: MirrorMode;
  /** 是否高亮显示带有发光判定环的 EX 音符 */
  highlightExNotes: boolean;
  /** 是否将绝赞滑条渲染为常规滑条颜色（而非绝赞黄色） */
  normalColorBreakSlide: boolean;
  /** 是否将滑条起点音符显示为粉色 */
  pinkSlideStart: boolean;
  /** 是否让滑条起点的星星音符随时间自转 */
  slideRotation: boolean;
  /** 判定线视觉显示样式 */
  judgmentLineDesign: JudgmentLineDesign;
  /** 是否显示当前实时 BPM */
  showBpm: boolean;
  /** 是否显示音符总数统计 */
  showNoteTotal: boolean;
  /** 是否显示绝赞音符总数统计 */
  showBreakCount: boolean;
  /** 是否在绝赞音符上显示击打序号文本 */
  showBreakIndex: boolean;
  /** 是否以彩虹渐变色显示当前 BPM 数值 */
  rainbowBpm: boolean;
  /** 是否启用基于节拍分频的音符着色模式（按 1/1、1/2、1/4 等拍位区分颜色） */
  ddrColorMode: boolean;
  /** 是否启用扩展节拍分频着色模式（额外区分 1/8、1/6 等更细分频） */
  ddrColorExtended: boolean;
  /** 是否显示触摸音符附带的烟花特效 */
  showFireworks: boolean;
  /** 是否显示音符击打命中特效（涵盖点按、Hold 尾部、引导星及绝赞） */
  showHitEffect: boolean;
}

/**
 * 辅助击打音效播放配置。
 */
export interface AudioConfig {
  /** 是否全局启用击打音效播放 */
  enabled: boolean;
  /** 是否启用 Hold 结束音效 */
  holdEndSoundEnabled: boolean;
  /** 是否启用屏幕触摸击打音效 */
  touchSoundEnabled: boolean;
  /** 音效输出音量（0 ~ 1） */
  volume: number;
  /** 音效播放的时间偏移调整量（毫秒，正数延迟，负数提前） */
  timingOffsetMs: number;
}

/**
 * 类型守卫：判断音符是否为点按类音符（包括常规点按 "tap"、绝赞 "break" 与同压点按 "simultaneous"）。
 */
export function isTapNote(note: Note): note is TapNote {
  return note.type === "tap" || note.type === "break" || note.type === "simultaneous";
}

/**
 * 类型守卫：判断音符是否为 Hold 起始端音符（包括单押 "hold-start" 与同压 "hold-start-simultaneous"）。
 */
export function isHoldStartNote(note: Note): note is HoldStartNote {
  return note.type === "hold-start" || note.type === "hold-start-simultaneous";
}

/**
 * 类型守卫：判断音符是否为 Hold 结束端音符（包括单押 "hold-end" 与同压 "hold-end-simultaneous"）。
 */
export function isHoldEndNote(note: Note): note is HoldEndNote {
  return note.type === "hold-end" || note.type === "hold-end-simultaneous";
}

/**
 * 类型守卫：判断音符是否为滑条音符（"slide"）。
 */
export function isSlideNote(note: Note): note is SlideNote {
  return note.type === "slide";
}

/**
 * 类型守卫：判断音符是否为常规屏幕触摸音符（"touch"）。
 */
export function isTouchNote(note: Note): note is TouchNote {
  return note.type === "touch";
}

/**
 * 类型守卫：判断音符是否为 Touch Hold 起始端音符（"touch-hold-start"）。
 */
export function isTouchHoldStartNote(note: Note): note is TouchHoldStartNote {
  return note.type === "touch-hold-start";
}

/**
 * 判断音符方位是否属于外圈按键（position 为 1 ~ 8 的数值，区别于屏幕触摸传感器标识）。
 */
export function isButtonNote(note: Note): boolean {
  return typeof note.position === "number" && note.position >= 1 && note.position <= 8;
}
