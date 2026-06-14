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
 * 安全转换按钮轨道位置（MA2 的 0-7 映射为引擎的 1-8）
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
    case "SLL": {
      const midPos = offsetButtonPosition(startPos, -2);
      return [
        { type: "-", startPos, endPos: midPos },
        { type: "-", startPos: midPos, endPos },
      ];
    }
    case "SLR": {
      const midPos = offsetButtonPosition(startPos, 2);
      return [
        { type: "-", startPos, endPos: midPos },
        { type: "-", startPos: midPos, endPos },
      ];
    }
    default:
      return null;
  }
}

/**
 * 安全校验并收窄 Touch 触控位置
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
 * 解析 MA2 格式谱面
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

    // 解析常规音符命令
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
          // 连续滑道追加逻辑
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
          // 首段滑道绑定逻辑；同一星星头可以挂多条独立路径。
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
              parentSlide.delayMs = delay; // 暂存拍数
            }
            if (parentSlide.allSlideSegments) {
              parentSlide.allSlideSegments.push(slideSegments);
            }
            if (parentSlide.allDurations) {
              parentSlide.allDurations.push(duration);
            }
            if (parentSlide.allDelayMs) {
              parentSlide.allDelayMs.push(delay); // 暂存拍数
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
            headlessSlide.delayMs = delay;
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

  // 保证至少有一个默认 of BPM 事件
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
   * 辅助函数：根据拍数绝对时间换算绝对毫秒数以及触发时的 BPM
   * 使用二分查找定位 BPM 事件，再计算偏移毫秒
   */
  function getMsFromBeat(beat: number): { ms: number; bpm: number } {
    // 二分查找：找到最后一个 timing <= beat 的事件
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

  // 拼装 Chart 返回格式
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
