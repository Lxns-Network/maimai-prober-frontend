/**
 * 所有可能的 Note 类型
 */
export type NoteType =
  | 'tap'
  | 'break'
  | 'simultaneous'
  | 'hold-start'
  | 'hold-start-simultaneous'
  | 'hold-end'
  | 'hold-end-simultaneous'
  | 'slide'
  | 'touch'
  | 'touch-hold-start'
  | 'touch-hold-end';

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
  | '-'
  | '>'
  | '<'
  | '^'
  | 'v'
  | 'p'
  | 'pp'
  | 'q'
  | 'qq'
  | 's'
  | 'z'
  | 'w'
  | 'V';

/**
 * 触摸判定区
 * - A1-A8: 外环判定区
 * - B1-B8: 内环判定区
 * - C1, C2: 中心判定区
 * - D1-D8: 按钮区域判定区
 * - E1-E8: 边缘判定区
 */
export type TouchPosition =
  | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8'
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8'
  | 'C' | 'C1' | 'C2'
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8'
  | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8';

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
export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'rotate180';

/**
 * 判定线显示
 * - blind: 无
 * - noLine: 判定点
 * - simple: 判定点 + 判定线
 * - sensor: 判定点 + 判定线 + 判定区
 */
export type JudgmentLineDesign = 'blind' | 'noLine' | 'simple' | 'sensor';

/**
 * DDR 风格颜色模式选项
 * - off: 关闭
 * - on: 开启
 * - extended: 扩展
 */
export type DdrColorMode = 'off' | 'on' | 'extended';

export type ChartDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

export const DIFFICULTY_NAMES: Record<ChartDifficulty, string> = {
  1: 'EASY',
  2: 'BASIC',
  3: 'ADVANCED',
  4: 'EXPERT',
  5: 'MASTER',
  6: 'Re:MASTER',
};

export const DIFFICULTY_COLORS: Record<ChartDifficulty, string> = {
  1: '#1E3A8A',
  2: '#22C55E',
  3: '#EAB308',
  4: '#EF4444',
  5: '#A855F7',
  6: '#F8FAFC',
};

export interface SlideSegment {
  /** 滑条路径类型 */
  type: SlidePathType;
  /** 起始按钮位置（1-8） */
  startPos: ButtonPosition;
  /** 结束按钮位置（1-8） */
  endPos: ButtonPosition;
  /** 缓存长度（懒计算） */
  cachedLength?: number;
}

export interface BaseNote {
  /** 按钮位置（1-8） */
  position: ButtonPosition | TouchPosition | string;
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
  /** 同时出现的 Note 数量 */
  simultaneousNoteCount?: number;
  /** 同时出现的滑条数量 */
  simultaneousSlideCount?: number;
  /** 同时出现的非触摸 Note 数量 */
  simultaneousNonTouchCount?: number;
  /** 同时出现的触摸 Note 数量 */
  simultaneousTouchCount?: number;
  /** 绝赞索引（不包含绝赞 Note） */
  noExBreakIndex?: number;
}

export interface TapNote extends BaseNote {
  type: 'tap' | 'break' | 'simultaneous';
  position: ButtonPosition;
  /** 是否有保护套 */
  isEx?: boolean;
}

export interface HoldStartNote extends BaseNote {
  type: 'hold-start' | 'hold-start-simultaneous';
  position: ButtonPosition;
  /** 持续时间（拍） */
  duration: number;
  /** 是否为 Hold 开始 */
  isHoldStart: true;
  /** 是否为绝赞 Note */
  isEx?: boolean;
  /** 是否为绝赞 Hold */
  isBreakHold?: boolean;
}

export interface HoldEndNote extends BaseNote {
  type: 'hold-end' | 'hold-end-simultaneous';
  position: ButtonPosition;
  /** 对应的 Hold 开始时间（拍） */
  holdStartTiming: number;
  /** 是否为 Hold 结束 */
  isHoldEnd: true;
  /** 是否有保护套 */
  isEx?: boolean;
  /** 是否为绝赞 Hold */
  isBreakHold?: boolean;
}

export interface SlideNote extends BaseNote {
  type: 'slide';
  position: ButtonPosition;
  /** 滑条起始 Note 是否为绝赞 */
  isStartBreak?: boolean;
  /** 每个滑条路径是否为绝赞 */
  allSlideBreaks?: boolean[];
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
  type: 'touch';
  position: TouchPosition | string;
  /** 是否有烟花效果 */
  hasFirework?: boolean;
  /** 此位置可见的触摸数量 */
  visibleTouchCount?: number;
}

export interface TouchHoldStartNote extends BaseNote {
  type: 'touch-hold-start';
  position: TouchPosition | string;
  /** 持续时间（拍） */
  duration: number;
  /** 持续时间（毫秒） */
  durationMs: number;
  /** 是否有烟花效果 */
  hasFirework?: boolean;
  /** 是否为 Hold 开始 */
  isHoldStart: true;
  /** 此位置可见的触摸数量 */
  visibleTouchCount?: number;
}

export interface TouchHoldEndNote extends BaseNote {
  type: 'touch-hold-end';
  position: TouchPosition | string;
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
}

export interface RestartPosition {
  /** 小节 */
  measure: number;
  /** 位置 */
  position: number;
}

export interface TimelineState {
  /** 总小节数 */
  totalMeasures: number;
  /** 每小节拍数 */
  beatsPerMeasure: number;
  /** 当前小节 */
  currentMeasure: number;
  /** 当前位置 */
  currentPosition: number;
  /** 精确时间（拍） */
  preciseTime: number;
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
  /** 是否显示 Note 总数 */
  showNoteTotal: boolean;
  /** 是否显示绝赞总数 */
  showBreakCount: boolean;
  /** 是否显示当前绝赞位置 */
  showBreakIndex: boolean;
  /** 是否使用彩虹色显示当前 BPM */
  rainbowBpm: boolean;
  /** 是否使用 DDR 风格显示判定线 */
  ddrColorMode: boolean;
  /** 是否使用扩展 DDR 风格显示判定线 */
  ddrColorExtended: boolean;
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
  return note.type === 'tap' || note.type === 'break' || note.type === 'simultaneous';
}

export function isHoldStartNote(note: Note): note is HoldStartNote {
  return note.type === 'hold-start' || note.type === 'hold-start-simultaneous';
}

export function isHoldEndNote(note: Note): note is HoldEndNote {
  return note.type === 'hold-end' || note.type === 'hold-end-simultaneous';
}

export function isSlideNote(note: Note): note is SlideNote {
  return note.type === 'slide';
}

export function isTouchNote(note: Note): note is TouchNote {
  return note.type === 'touch';
}

export function isTouchHoldStartNote(note: Note): note is TouchHoldStartNote {
  return note.type === 'touch-hold-start';
}

export function isTouchHoldEndNote(note: Note): note is TouchHoldEndNote {
  return note.type === 'touch-hold-end';
}

export function isHoldNote(note: Note): note is HoldStartNote | HoldEndNote {
  return isHoldStartNote(note) || isHoldEndNote(note);
}

export function isTouchHoldNote(note: Note): note is TouchHoldStartNote | TouchHoldEndNote {
  return isTouchHoldStartNote(note) || isTouchHoldEndNote(note);
}

export function isButtonNote(note: Note): boolean {
  return typeof note.position === 'number' && note.position >= 1 && note.position <= 8;
}

export function countDisplayNotes(notes: Note[]): number {
  let totalNotes = 0;

  for (const note of notes) {
    if (isTapNote(note) || 
        isHoldEndNote(note) ||
        isSlideNote(note) ||
        isTouchNote(note) ||
        note.type === 'touch-hold-end') {
      totalNotes++;
    }

    if (isSlideNote(note)) {
      const pathCount = note.allSlideSegments?.length ?? 1;
      totalNotes += pathCount;
    }
  }

  return totalNotes;
}
