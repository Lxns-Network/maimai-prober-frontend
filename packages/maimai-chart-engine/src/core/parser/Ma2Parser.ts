import type {
  Chart,
  ChartLevels,
  ChartDesigners,
  ChartDifficulty,
  AvailableDifficulties,
  Note,
  TapNote,
  HoldStartNote,
  HoldEndNote,
  SlideNote,
  TouchNote,
  TouchHoldStartNote,
  TouchHoldEndNote,
  BpmEvent,
  DivisorEvent,
  SlideSegment,
  ButtonPosition,
  TouchPosition,
} from "../../types";
import { isUpperHalf } from "../../utils/slideAreaSteps";

/**
 * 安全转换按钮轨道位置（将 MA2 格式的 0-7 索引映射为引擎的 1-8 轨道）。
 * 超出 0-7 范围时回退为轨道 1。
 */
function getButtonPosition(val: number): ButtonPosition {
  const pos = val + 1;
  if (pos >= 1 && pos <= 8) return pos as ButtonPosition;
  return 1;
}

function offsetButtonPosition(pos: ButtonPosition, offset: number): ButtonPosition {
  return (((((pos - 1 + offset) % 8) + 8) % 8) + 1) as ButtonPosition;
}

const SIMPLE_SLIDE_MAP: Record<string, SlideSegment["type"]> = {
  SI_: "-",
  SUL: "p",
  SUR: "q",
  SXL: "pp",
  SXR: "qq",
  SV_: "v",
  SVP: "v",
  SF_: "w",
  SWF: "w",
  SSL: "s",
  SSR: "z",
};

/**
 * 根据滑键指令类型及起止位置构建滑段段落列表。
 * 若指令类型未识别则返回 null。
 */
function createSlideSegments(
  mainType: string,
  startPos: ButtonPosition,
  endPos: ButtonPosition,
): SlideSegment[] | null {
  const simpleType = SIMPLE_SLIDE_MAP[mainType];
  if (simpleType) return [{ type: simpleType, startPos, endPos }];

  switch (mainType) {
    case "SCR":
      return [{ type: isUpperHalf(startPos) ? ">" : "<", startPos, endPos }];
    case "SCL":
      return [{ type: isUpperHalf(startPos) ? "<" : ">", startPos, endPos }];
    // grand-V（折线滑段）：单段 V，以起点沿圆周偏转 2 轨（start∓2）为中间拐点，走 L 形模板
    case "SLL":
      return [{ type: "V", startPos, endPos, midPos: offsetButtonPosition(startPos, -2) }];
    case "SLR":
      return [{ type: "V", startPos, endPos, midPos: offsetButtonPosition(startPos, 2) }];
    default:
      return null;
  }
}

/**
 * 类型守卫：校验位置标识是否为有效的触控区域（中心区 C/C1/C2 或圆周区 A/B/D/E 配合 1-8 轨道）。
 */
function isTouchPosition(pos: string): pos is TouchPosition {
  if (pos === "C" || pos === "C1" || pos === "C2") return true;
  const region = pos[0];
  const num = Number.parseInt(pos.substring(1), 10);
  return ["A", "B", "D", "E"].includes(region) && !Number.isNaN(num) && num >= 1 && num <= 8;
}

function createSlideNote(params: {
  position: ButtonPosition;
  timing: number;
  measure: number;
  positionInMeasure: number;
  bpm: number;
  isStartBreak: boolean;
  isEx: boolean;
  isHeadless?: boolean;
}): SlideNote {
  return {
    position: params.position,
    timing: params.timing,
    timingMs: 0,
    type: "slide",
    measure: params.measure,
    positionInMeasure: params.positionInMeasure,
    scale: 1,
    bpm: params.bpm,
    isHeadless: params.isHeadless,
    headlessMode: params.isHeadless ? "fade" : undefined,
    isStartBreak: params.isStartBreak,
    isEx: params.isEx,
    duration: 0,
    durationMs: 0,
    delayMs: 0,
    slideSegments: [],
    allSlideSegments: [],
    allDurations: [],
    allDurationMs: [],
    allDelayMs: [],
    allCustomLengths: [],
    isSplitSlide: false,
  };
}

/**
 * 解析 MA2 格式谱面并转换为统一的 Chart 结构。
 *
 * 契约与副作用：
 * - 解析时会在谱面开头插入 1 小节（4 拍）的前奏偏移，所有音符及事件的时值均向后平移。
 *
 * @throws {Error} 当谱面文本中缺少 RESOLUTION 或 BPM_DEF 声明时抛出异常
 */
export function parseMa2Chart(ma2Text: string, difficulty: ChartDifficulty): Chart {
  const lines = ma2Text.split(/\r?\n/);

  let resolution: number | undefined;
  let initialBpm: number | undefined;
  let designer = "";
  let title = "";
  let artist = "";
  let playLevel = "";

  const notes: Note[] = [];
  const bpmEvents: BpmEvent[] = [];
  const divisorEvents: DivisorEvent[] = [];

  // 第一遍扫描：收集头部元数据
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    const cmd = tokens[0].toUpperCase();

    // 如果首项是数字，表示已进入音符/BPM/MET数据区，跳过头部解析
    if (/^\d+$/.test(cmd)) continue;

    switch (cmd) {
      case "RESOLUTION": {
        const val = Number.parseInt(tokens[1], 10);
        if (!Number.isNaN(val)) resolution = val;
        break;
      }
      case "BPM_DEF": {
        const val = Number.parseFloat(tokens[1]);
        if (!Number.isNaN(val)) initialBpm = val;
        break;
      }
      case "CREATOR":
      case "DESIGNER":
        designer = tokens.slice(1).join(" ");
        break;
      case "PLAYLEVEL":
        playLevel = tokens[1] || "";
        break;
      case "TITLE":
        title = tokens.slice(1).join(" ");
        break;
      case "ARTIST":
        artist = tokens.slice(1).join(" ");
        break;
    }
  }

  if (resolution === undefined) {
    throw new Error("MA2 文件缺少 RESOLUTION 声明");
  }
  if (initialBpm === undefined) {
    throw new Error("MA2 文件缺少 BPM_DEF 声明");
  }

  // 临时存储 BPM 改变事件用于计算 timingMs
  interface RawBpmEvent {
    timing: number;
    bpm: number;
  }
  const rawBpmEvents: RawBpmEvent[] = [];

  // 用于在解析滑道时向前匹配父滑条的辅助列表
  const slideNotesList: SlideNote[] = [];

  // 第二遍扫描：解析所有音符和事件行
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;

    const cmd = tokens[0].toUpperCase();

    if (cmd === "BPM") {
      const bar = Number.parseInt(tokens[1], 10);
      const tick = Number.parseInt(tokens[2], 10);
      const bpmVal = Number.parseFloat(tokens[3]);
      if (!Number.isNaN(bar) && !Number.isNaN(tick) && !Number.isNaN(bpmVal)) {
        const timing = (bar + tick / resolution) * 4;
        rawBpmEvents.push({ timing, bpm: bpmVal });
      }
      continue;
    }

    if (cmd === "MET") {
      const bar = Number.parseInt(tokens[1], 10);
      const tick = Number.parseInt(tokens[2], 10);
      const beats = Number.parseInt(tokens[3], 10);
      if (!Number.isNaN(bar) && !Number.isNaN(tick) && !Number.isNaN(beats)) {
        const timing = (bar + tick / resolution) * 4;
        divisorEvents.push({ timing, divisor: beats });
      }
      continue;
    }

    const bar = Number.parseInt(tokens[1], 10);
    const tick = Number.parseInt(tokens[2], 10);
    if (Number.isNaN(bar) || Number.isNaN(tick)) continue;

    const timing = (bar + tick / resolution) * 4;
    const positionInMeasure = Math.floor((tick / resolution) * 512);

    const isChain = cmd.startsWith("CN");
    const isBreak = cmd.startsWith("BR");
    const isEx = cmd.startsWith("EX") || cmd.startsWith("BX");

    const mainType = cmd.substring(2);

    if (mainType === "TAP") {
      const rawPos = Number.parseInt(tokens[3], 10);
      if (!Number.isNaN(rawPos)) {
        const pos = getButtonPosition(rawPos);
        const tapNote: TapNote = {
          position: pos,
          timing,
          timingMs: 0,
          type: isBreak ? "break" : "tap",
          measure: bar,
          positionInMeasure,
          scale: 1,
          bpm: initialBpm,
          isEx,
        };
        notes.push(tapNote);
      }
    } else if (mainType === "HLD") {
      const rawPos = Number.parseInt(tokens[3], 10);
      const durationTicks = Number.parseInt(tokens[4], 10);
      if (!Number.isNaN(rawPos) && !Number.isNaN(durationTicks)) {
        const pos = getButtonPosition(rawPos);
        const duration = durationTicks / (resolution / 4);

        const holdStart: HoldStartNote = {
          position: pos,
          timing,
          timingMs: 0,
          type: "hold-start",
          measure: bar,
          positionInMeasure,
          scale: 1,
          bpm: initialBpm,
          duration,
          isHoldStart: true,
          isEx,
          isBreakHold: isBreak,
        };
        notes.push(holdStart);

        const endTiming = timing + duration;
        const endTick = tick + durationTicks;
        const endBar = bar + Math.floor(endTick / resolution);
        const endPositionInMeasure = Math.floor(((endTick % resolution) / resolution) * 512);

        const holdEnd: HoldEndNote = {
          position: pos,
          timing: endTiming,
          timingMs: 0,
          type: "hold-end",
          measure: endBar,
          positionInMeasure: endPositionInMeasure,
          scale: 1,
          bpm: initialBpm,
          holdStartTiming: timing,
          isHoldEnd: true,
          isEx,
          isBreakHold: isBreak,
        };
        notes.push(holdEnd);
      }
    } else if (mainType === "STR") {
      const rawPos = Number.parseInt(tokens[3], 10);
      if (!Number.isNaN(rawPos)) {
        const pos = getButtonPosition(rawPos);
        const slideNote = createSlideNote({
          position: pos,
          timing,
          measure: bar,
          positionInMeasure,
          bpm: initialBpm,
          isStartBreak: isBreak,
          isEx,
        });
        notes.push(slideNote);
        slideNotesList.push(slideNote);
      }
    } else if (
      mainType === "SI_" ||
      mainType === "SCR" ||
      mainType === "SCL" ||
      mainType === "SXR" ||
      mainType === "SXL" ||
      mainType === "SUL" ||
      mainType === "SUR" ||
      mainType === "SV_" ||
      mainType === "SVP" ||
      mainType === "SF_" ||
      mainType === "SWF" ||
      mainType === "SSL" ||
      mainType === "SSR" ||
      mainType === "SLL" ||
      mainType === "SLR"
    ) {
      const rawStartPos = Number.parseInt(tokens[3], 10);
      const delayTicks = Number.parseInt(tokens[4], 10);
      const durationTicks = Number.parseInt(tokens[5], 10);
      const rawEndPos = Number.parseInt(tokens[6], 10);

      if (
        !Number.isNaN(rawStartPos) &&
        !Number.isNaN(delayTicks) &&
        !Number.isNaN(durationTicks) &&
        !Number.isNaN(rawEndPos)
      ) {
        const startPos = getButtonPosition(rawStartPos);
        const endPos = getButtonPosition(rawEndPos);
        const slideSegments = createSlideSegments(mainType, startPos, endPos);
        if (!slideSegments) continue;

        const duration = durationTicks / (resolution / 4);

        if (isChain) {
          // 接续滑段：根据终点轨道匹配及前序段到达时间（容差 0.5 拍）定位待衔接的父滑道路径
          let parentSlide: SlideNote | null = null;
          let parentPathIndex = -1;
          for (let idx = slideNotesList.length - 1; idx >= 0; idx--) {
            const s = slideNotesList[idx];
            const paths = s.allSlideSegments ?? [s.slideSegments];
            for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
              const path = paths[pathIndex];
              const lastSegment = path[path.length - 1];
              if (!lastSegment || lastSegment.endPos !== startPos) continue;

              const pathDelay = s.allDelayMs?.[pathIndex] ?? s.delayMs ?? 1;
              const pathDuration = s.allDurations?.[pathIndex] ?? s.duration;
              const parentEndTiming = s.timing + pathDelay + pathDuration;

              if (Math.abs(parentEndTiming - timing) < 0.5) {
                parentSlide = s;
                parentPathIndex = pathIndex;
                break;
              }
            }

            if (parentSlide) break;
          }

          if (parentSlide && parentPathIndex >= 0) {
            const allSlideSegments = parentSlide.allSlideSegments ?? [parentSlide.slideSegments];
            allSlideSegments[parentPathIndex].push(...slideSegments);
            parentSlide.allSlideSegments = allSlideSegments;
            parentSlide.slideSegments = allSlideSegments[0];

            if (parentSlide.allDurations) {
              parentSlide.allDurations[parentPathIndex] =
                (parentSlide.allDurations[parentPathIndex] ?? 0) + duration;
              parentSlide.duration = parentSlide.allDurations[0] ?? parentSlide.duration;
            }
            if (parentSlide.allCustomLengths) {
              parentSlide.allCustomLengths[parentPathIndex] = null;
            }
            parentSlide.isSplitSlide = allSlideSegments.length > 1;
            if (isEx) parentSlide.isEx = true;
          }
        } else {
          // 首段滑道：若存在相同时刻同轨道的滑条头部则绑定为新路径（支持同头多路径），否则降级为无头滑条
          let parentSlide: SlideNote | null = null;
          for (let idx = slideNotesList.length - 1; idx >= 0; idx--) {
            const s = slideNotesList[idx];
            if (s.position === startPos && Math.abs(s.timing - timing) < 0.01) {
              parentSlide = s;
              break;
            }
          }

          if (parentSlide) {
            const isFirstPath = parentSlide.slideSegments.length === 0;
            const delay = delayTicks / (resolution / 4);

            if (isFirstPath) {
              parentSlide.slideSegments = slideSegments;
              parentSlide.duration = duration;
              parentSlide.delayMs = delay; // 阶段暂存：此时单位为节拍数（beat），后续统一步骤才换算为毫秒
            }
            if (parentSlide.allSlideSegments) {
              parentSlide.allSlideSegments.push(slideSegments);
            }
            if (parentSlide.allDurations) {
              parentSlide.allDurations.push(duration);
            }
            if (parentSlide.allDelayMs) {
              parentSlide.allDelayMs.push(delay); // 阶段暂存：此时单位为节拍数（beat）
            }
            if (parentSlide.allCustomLengths) {
              parentSlide.allCustomLengths.push(null);
            }
            if (parentSlide.allSlideBreaks) {
              parentSlide.allSlideBreaks.push(isBreak);
            } else {
              parentSlide.allSlideBreaks = [isBreak];
            }
            parentSlide.isSplitSlide = (parentSlide.allSlideSegments?.length ?? 1) > 1;
          } else {
            const delay = delayTicks / (resolution / 4);
            const headlessSlide = createSlideNote({
              position: startPos,
              timing,
              measure: bar,
              positionInMeasure,
              bpm: initialBpm,
              isStartBreak: false,
              isEx,
              isHeadless: true,
            });
            headlessSlide.slideSegments = slideSegments;
            headlessSlide.allSlideSegments = [slideSegments];
            headlessSlide.duration = duration;
            headlessSlide.allDurations = [duration];
            headlessSlide.delayMs = delay; // 阶段暂存：此时单位为节拍数（beat），后续统一步骤才换算为毫秒
            headlessSlide.allDelayMs = [delay];
            headlessSlide.allCustomLengths = [null];
            headlessSlide.allSlideBreaks = [isBreak];
            notes.push(headlessSlide);
            slideNotesList.push(headlessSlide);
          }
        }
      }
    } else if (mainType === "TTP") {
      const rawPos = Number.parseInt(tokens[3], 10);
      const region = tokens[4].toUpperCase();
      const hasFirework = Number.parseInt(tokens[5], 10) === 1;
      if (!Number.isNaN(rawPos)) {
        const touchPosStr = region === "C" ? "C" : `${region}${rawPos + 1}`;
        if (isTouchPosition(touchPosStr)) {
          const touchNote: TouchNote = {
            position: touchPosStr,
            timing,
            timingMs: 0,
            type: "touch",
            measure: bar,
            positionInMeasure,
            scale: 1,
            bpm: initialBpm,
            hasFirework,
          };
          notes.push(touchNote);
        }
      }
    } else if (mainType === "THO") {
      const rawPos = Number.parseInt(tokens[3], 10);
      const durationTicks = Number.parseInt(tokens[4], 10);
      const region = tokens[5].toUpperCase();
      const hasFirework = Number.parseInt(tokens[6], 10) === 1;
      if (!Number.isNaN(rawPos) && !Number.isNaN(durationTicks)) {
        const touchPosStr = region === "C" ? "C" : `${region}${rawPos + 1}`;
        if (isTouchPosition(touchPosStr)) {
          const duration = durationTicks / (resolution / 4);

          const touchHoldStart: TouchHoldStartNote = {
            position: touchPosStr,
            timing,
            timingMs: 0,
            type: "touch-hold-start",
            measure: bar,
            positionInMeasure,
            scale: 1,
            bpm: initialBpm,
            duration,
            durationMs: 0,
            hasFirework,
            isHoldStart: true,
          };
          notes.push(touchHoldStart);

          const endTiming = timing + duration;
          const endTick = tick + durationTicks;
          const endBar = bar + Math.floor(endTick / resolution);
          const endPositionInMeasure = Math.floor(((endTick % resolution) / resolution) * 512);

          const touchHoldEnd: TouchHoldEndNote = {
            position: touchPosStr,
            timing: endTiming,
            timingMs: 0,
            type: "touch-hold-end",
            measure: endBar,
            positionInMeasure: endPositionInMeasure,
            scale: 1,
            bpm: initialBpm,
            holdStartTiming: timing,
            hasFirework,
            isHoldEnd: true,
          };
          notes.push(touchHoldEnd);
        }
      }
    }
  }

  // 保证至少有一个默认 BPM 事件
  if (rawBpmEvents.length === 0) {
    rawBpmEvents.push({ timing: 0, bpm: initialBpm });
  }
  rawBpmEvents.sort((a, b) => a.timing - b.timing);

  for (const raw of rawBpmEvents) {
    bpmEvents.push({ timing: raw.timing, bpm: raw.bpm });
  }

  // 预计算每个 BPM 事件的累积毫秒值
  const bpmCumMs: number[] = [0];
  for (let i = 1; i < bpmEvents.length; i++) {
    const prev = bpmEvents[i - 1];
    bpmCumMs[i] = bpmCumMs[i - 1] + (60000 * (bpmEvents[i].timing - prev.timing)) / prev.bpm;
  }

  /**
   * 将绝对拍数转换为绝对时间（毫秒）及该时刻生效的 BPM。
   * 依赖 bpmEvents 已按时间升序排列且 bpmCumMs 前缀累积毫秒已计算完成。
   */
  function getMsFromBeat(beat: number): { ms: number; bpm: number } {
    // 采用偏右中点向上取整，在满足 timing <= beat 时向右收敛，避免区间长度为 2 时死循环
    let lo = 0;
    let hi = bpmEvents.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bpmEvents[mid].timing <= beat) lo = mid;
      else hi = mid - 1;
    }
    return {
      ms: bpmCumMs[lo] + (60000 * (beat - bpmEvents[lo].timing)) / bpmEvents[lo].bpm,
      bpm: bpmEvents[lo].bpm,
    };
  }

  // 遍历 notes 计算绝对毫秒值，并把暂存的时值拍数转换为 ms 持续时间
  for (const note of notes) {
    const timingInfo = getMsFromBeat(note.timing);
    note.timingMs = timingInfo.ms;
    note.bpm = timingInfo.bpm;

    if (note.type === "slide") {
      const slideNote = note as SlideNote;
      const delayBeats = slideNote.delayMs || 0;
      const allDelayBeats = slideNote.allDelayMs ? [...slideNote.allDelayMs] : [delayBeats];
      slideNote.delayMs = (60000 * delayBeats) / note.bpm;

      if (slideNote.allDelayMs) {
        slideNote.allDelayMs = allDelayBeats.map((pathDelayBeats) => {
          return (60000 * pathDelayBeats) / note.bpm;
        });
      }

      if (slideNote.allDurations && slideNote.allDurationMs) {
        slideNote.allDurationMs = slideNote.allDurations.map((dur, idx) => {
          const pathDelayBeats = allDelayBeats[idx] ?? delayBeats;
          const startBeat = note.timing + pathDelayBeats;
          const startMs = getMsFromBeat(startBeat).ms;
          const endMs = getMsFromBeat(startBeat + dur).ms;
          return endMs - startMs;
        });
      }

      slideNote.durationMs = slideNote.allDurationMs ? slideNote.allDurationMs[0] : 0;
    }

    if (note.type === "touch-hold-start") {
      const ths = note as TouchHoldStartNote;
      const endMs = getMsFromBeat(note.timing + ths.duration).ms;
      ths.durationMs = endMs - note.timingMs;
    }
  }

  // 前奏偏移对齐（将音轨推后 1 小节）
  const firstBpm = bpmEvents[0]?.bpm || initialBpm;
  const leadInMs = (60000 * 4) / firstBpm;

  for (const note of notes) {
    note.measure += 1;
    note.timing += 4;
    note.timingMs += leadInMs;

    if ("holdStartTiming" in note && note.holdStartTiming !== undefined) {
      if (note.type === "hold-end") {
        (note as HoldEndNote).holdStartTiming += 4;
      } else if (note.type === "touch-hold-end") {
        (note as TouchHoldEndNote).holdStartTiming += 4;
      }
    }
  }

  for (const event of bpmEvents) {
    event.timing += 4;
  }
  bpmEvents.unshift({ timing: 0, bpm: firstBpm });

  for (const event of divisorEvents) {
    event.timing += 4;
  }
  divisorEvents.unshift({ timing: 0, divisor: 4 });
  divisorEvents.sort((a, b) => a.timing - b.timing);

  const availableDifficulties: AvailableDifficulties = { [difficulty]: true };

  const level: ChartLevels = {};
  const designers: ChartDesigners = {};
  level[`lv_${difficulty}` as keyof ChartLevels] = playLevel;
  designers[`des_${difficulty}` as keyof ChartDesigners] = designer;

  let maxMeasure = 0;
  for (const note of notes) {
    if (note.measure > maxMeasure) {
      maxMeasure = note.measure;
    }
  }

  return {
    bpm: firstBpm,
    title,
    artist,
    designer,
    level,
    designers,
    difficulty,
    availableDifficulties,
    measures: maxMeasure + 2,
    notes,
    bpmEvents,
    divisorEvents,
  };
}
