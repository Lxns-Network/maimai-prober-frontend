import { match } from "ts-pattern";
import {
  Chart,
  ChartMetadata,
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
  SlidePathType,
  ButtonPosition,
  TouchPosition,
} from "../../types";

interface ParseNotesResult {
  notes: Note[];
  firstBpm: number;
  bpmEvents: BpmEvent[];
  divisorEvents: DivisorEvent[];
}

const INOTE_MARKERS = [
  "&inote_1=",
  "&inote_2=",
  "&inote_3=",
  "&inote_4=",
  "&inote_5=",
  "&inote_6=",
];

function hasChartDigit(text: string): boolean {
  for (const char of text) {
    if (char >= "1" && char <= "8") return true;
  }
  return false;
}

function splitLines(text: string): string[] {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isMultiDigitNote(noteStr: string): boolean {
  if (noteStr.length < 2) return false;
  for (const char of noteStr) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}

/**
 * 探测谱面文本中包含的可用难度。
 *
 * 检测 `&inote_1=` 至 `&inote_6=` 标签；若均未提供但非元数据行中包含音符按键字符（'1'-'8'），则按单难度谱面回退并标记难度 4 可用。
 * 不抛出异常；若无可用谱面内容则返回空对象。
 */
export function getAvailableDifficulties(simaiText: string): AvailableDifficulties {
  const available: AvailableDifficulties = {};
  const lowerSimaiText = simaiText.toLowerCase();

  for (let i = 0; i < INOTE_MARKERS.length; i++) {
    if (lowerSimaiText.includes(INOTE_MARKERS[i])) {
      available[(i + 1) as ChartDifficulty] = true;
    }
  }

  if (Object.keys(available).length === 0) {
    const hasChartContent = hasChartDigit(
      splitLines(simaiText)
        .filter((line) => !line.trimStart().startsWith("&"))
        .join(""),
    );
    if (hasChartContent) {
      available[4] = true;
    }
  }

  return available;
}

/**
 * 解析 Simai 格式谱面文本并生成谱面数据对象。
 *
 * @param simaiText - 包含元数据与谱面内容的文本。必须为非空字符串且包含 `&` 元数据行。
 * @param difficulty - 目标难度。未指定时默认使用可用难度中的最高难度；无 inote 标记时回退使用难度 4。
 * @returns 解析后的谱面对象。谱面开头会自动附加 1 小节（4 拍）前奏偏移。
 * @throws {Error} 输入为空、缺少 `&` 元数据、目标难度不存在、缺少 BPM 声明或语法解析失败时抛出。
 */
export function parseSimaiChart(simaiText: string, difficulty?: ChartDifficulty): Chart {
  if (!simaiText || typeof simaiText !== "string") {
    throw new Error("Invalid input: expected a non-empty string");
  }

  const lines = splitLines(simaiText);

  if (!lines.some((line) => line.startsWith("&"))) {
    throw new Error("Invalid simai format: expected & metadata lines (e.g. &title=, &inote_4=)");
  }

  const metadata: ChartMetadata = {
    bpm: Number.NaN,
    title: "",
    artist: "",
    designer: "",
    level: {},
    designers: {},
    availableDifficulties: {},
    inotes: {},
  };

  let currentInote: number | null = null;
  let currentInoteContent: string[] = [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      const inoteMatch = trimmedLine.match(/^&inote_(\d)=(.*)$/i);
      if (inoteMatch) {
        if (currentInote !== null) {
          metadata.inotes[currentInote] = currentInoteContent.join("\n");
          metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
        }

        currentInote = parseInt(inoteMatch[1]);
        currentInoteContent = inoteMatch[2] ? [inoteMatch[2]] : [];
        continue;
      }

      if (currentInote !== null) {
        if (trimmedLine.startsWith("&") && !trimmedLine.startsWith("&inote")) {
          metadata.inotes[currentInote] = currentInoteContent.join("\n");
          metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
          currentInote = null;
          currentInoteContent = [];

          parseMetadataLine(trimmedLine, metadata);
        } else if (!trimmedLine.startsWith("&")) {
          currentInoteContent.push(line);
        }
        continue;
      }

      if (trimmedLine.startsWith("&")) {
        parseMetadataLine(trimmedLine, metadata);
      }
    }

    if (currentInote !== null) {
      metadata.inotes[currentInote] = currentInoteContent.join("\n");
      metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
    }

    let selectedDifficulty = difficulty;
    const availableDiffs = Object.keys(metadata.inotes)
      .map(Number)
      .sort((a, b) => b - a);

    if (!selectedDifficulty && availableDiffs.length > 0) {
      selectedDifficulty = availableDiffs[0] as ChartDifficulty;
    }

    let chartBody = "";

    if (selectedDifficulty && metadata.inotes[selectedDifficulty]) {
      chartBody = metadata.inotes[selectedDifficulty];
    } else if (availableDiffs.length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "" || line.startsWith("&")) continue;
        chartBody += line;
      }
      metadata.availableDifficulties[4] = true;
      selectedDifficulty = 4;
    } else {
      throw new Error(
        `Difficulty ${difficulty} not found in chart. Available: ${availableDiffs.join(", ")}`,
      );
    }

    const designerKey = `des_${selectedDifficulty}` as keyof ChartDesigners;
    const selectedDesigner = metadata.designers[designerKey] || metadata.designer;

    if (Number.isNaN(metadata.bpm)) {
      const inlineBpm = chartBody.match(/\((\d+(?:\.\d+)?)\)/);
      if (inlineBpm) metadata.bpm = parseFloat(inlineBpm[1]);
    }

    const parseResult = parseNotes(chartBody, metadata.bpm);
    const notes = parseResult.notes;
    const bpmEvents = parseResult.bpmEvents;
    const divisorEvents = parseResult.divisorEvents;
    metadata.bpm = parseResult.firstBpm;

    if (Number.isNaN(metadata.bpm)) {
      throw new Error("Simai 文件缺少 BPM 声明（无 &bpm 元数据，谱面中也没有内联 BPM）");
    }

    let maxMeasure = 0;
    let maxTiming = 0;

    for (const note of notes) {
      if (note.measure > maxMeasure) {
        maxMeasure = note.measure;
      }

      let endTiming = note.timing;

      if ("isHoldStart" in note && note.isHoldStart && "duration" in note) {
        endTiming = note.timing + note.duration;
      }

      // 滑条可能包含基于毫秒定义的延迟与持续时间（## 语法），需按最晚结束时间换算拍数以防小节截断
      if (note.type === "slide") {
        const slideNote = note as SlideNote;
        const delays = slideNote.allDelayMs ?? [slideNote.delayMs ?? 0];
        const durations = slideNote.allDurationMs ?? [slideNote.durationMs ?? 0];
        let maxEndMs = 0;
        for (let i = 0; i < Math.max(delays.length, durations.length); i++) {
          maxEndMs = Math.max(maxEndMs, (delays[i] ?? 0) + (durations[i] ?? 0));
        }
        endTiming = note.timing + (maxEndMs * slideNote.bpm) / 60000;
      }

      if (note.type === "touch-hold-start") {
        const touchHold = note as TouchHoldStartNote;
        if (touchHold.duration !== undefined) {
          endTiming = note.timing + touchHold.duration;
        }
      }

      if (endTiming > maxTiming) {
        maxTiming = endTiming;
      }
    }

    const measuresFromTiming = Math.ceil(maxTiming / 4);
    maxMeasure = Math.max(maxMeasure, measuresFromTiming);

    const leadInMs = (60000 * 4) / parseResult.firstBpm;

    for (const note of notes) {
      note.measure += 1;
      note.timing += 4;
      note.timingMs += leadInMs;

      if ("holdStartTiming" in note && note.holdStartTiming !== undefined) {
        (note as HoldEndNote | TouchHoldEndNote).holdStartTiming += 4;
      }
    }

    for (const event of bpmEvents) {
      event.timing += 4;
    }
    bpmEvents.unshift({ timing: 0, bpm: parseResult.firstBpm });

    for (const event of divisorEvents) {
      event.timing += 4;
    }
    divisorEvents.unshift({ timing: 0, divisor: 4 });
    divisorEvents.sort((a, b) => a.timing - b.timing);

    return {
      bpm: parseResult.firstBpm,
      title: metadata.title,
      artist: metadata.artist,
      designer: selectedDesigner,
      level: metadata.level,
      designers: metadata.designers,
      difficulty: selectedDifficulty,
      availableDifficulties: metadata.availableDifficulties,
      measures: maxMeasure + 2, // 预留前奏与尾奏各 1 小节缓冲
      notes,
      bpmEvents,
      divisorEvents,
      firstMs: metadata.firstSec !== undefined ? metadata.firstSec * 1000 : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Parse error: ${message}`);
  }
}

/**
 * 解析单行元数据（`&key=value`），就地更新传入的 metadata 对象。
 */
function parseMetadataLine(line: string, metadata: ChartMetadata): void {
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) return;

  const key = line.substring(1, eqIndex).trim();
  const value = line.substring(eqIndex + 1).trim();

  switch (key) {
    case "title":
      metadata.title = value;
      break;
    case "artist":
      metadata.artist = value;
      break;
    case "des":
      metadata.designer = value;
      break;
    case "des_1":
    case "des_2":
    case "des_3":
    case "des_4":
    case "des_5":
    case "des_6":
      metadata.designers[key as keyof ChartDesigners] = value;
      break;
    case "lv_1":
    case "lv_2":
    case "lv_3":
    case "lv_4":
    case "lv_5":
    case "lv_6":
      metadata.level[key as keyof ChartLevels] = value;
      break;
    case "bpm": {
      const bpmVal = parseFloat(value);
      if (!isNaN(bpmVal)) {
        metadata.bpm = bpmVal;
      }
      break;
    }
    case "first": {
      const firstVal = parseFloat(value);
      if (!isNaN(firstVal)) {
        metadata.firstSec = firstVal;
      }
      break;
    }
  }
}

/**
 * 遍历谱面字符流，解析所有音符及 BPM、拍数（Divisor）变化事件。
 *
 * 时间推进完全由逗号 `,` 驱动；状态标记（BPM、拍数、流速）就地生效并不消耗拍数。
 */
function parseNotes(chartBody: string, initialBpm: number): ParseNotesResult {
  const notes: Note[] = [];
  const bpmEvents: BpmEvent[] = [];
  const divisorEvents: DivisorEvent[] = [];

  let currentBpm = initialBpm;
  let firstBpm: number | null = null;
  let divisor = 4;
  let currentBeat = 0;
  let currentMs = 0;
  let currentHiSpeed = 1;

  let pos = 0;

  const skipWhitespace = () => {
    while (pos < chartBody.length && isWhitespace(chartBody[pos])) {
      pos++;
    }
  };

  while (pos < chartBody.length) {
    skipWhitespace();
    if (pos >= chartBody.length) break;

    let noteContent = "";
    const startPos = pos;

    while (pos < chartBody.length && chartBody[pos] !== ",") {
      const char = chartBody[pos];
      if (isWhitespace(char)) {
        pos++;
        continue;
      }
      if (char === "(") {
        const bpmMatch = chartBody.slice(pos).match(/^\((\d+(?:\.\d+)?)\)/);
        if (bpmMatch) {
          currentBpm = parseFloat(bpmMatch[1]);
          if (firstBpm === null) firstBpm = currentBpm;
          bpmEvents.push({ timing: currentBeat, bpm: currentBpm });
          pos += bpmMatch[0].length;
          continue;
        }
      }
      if (char === "{") {
        const divisorMatch = chartBody.slice(pos).match(/^\{(\d+(?:\.\d+)?)\}/);
        if (divisorMatch) {
          const newDivisor = parseFloat(divisorMatch[1]);
          if (newDivisor !== divisor) {
            divisor = newDivisor;
            divisorEvents.push({ timing: currentBeat, divisor });
          }
          pos += divisorMatch[0].length;
          continue;
        }
      }
      if (char === "<") {
        const hsMatch = chartBody.slice(pos).match(/^<HS\*([-+]?\d*\.?\d+)>/i);
        if (hsMatch) {
          currentHiSpeed = parseFloat(hsMatch[1]);
          pos += hsMatch[0].length;
          continue;
        }
      }
      noteContent += char;
      pos++;
    }

    if (pos === startPos && pos < chartBody.length && chartBody[pos] !== ",") {
      pos++;
      continue;
    }

    const beatIncrement = 4 / divisor;

    if (noteContent.trim() !== "") {
      const measure = Math.floor(currentBeat / 4);
      const positionInMeasure = Math.floor(((currentBeat % 4) / 4) * 512);

      const noteGroups: string[] = [];
      let currentGroup = "";

      for (let i = 0; i < noteContent.length; i++) {
        if (noteContent[i] === "`") {
          if (currentGroup.trim() !== "") {
            noteGroups.push(currentGroup.trim());
          }
          currentGroup = "`";
        } else if (noteContent[i] === "/") {
          if (currentGroup.trim() !== "") {
            noteGroups.push(currentGroup.trim());
          }
          currentGroup = "";
        } else {
          currentGroup += noteContent[i];
        }
      }
      if (currentGroup.trim() !== "") {
        noteGroups.push(currentGroup.trim());
      }

      const isSimultaneous = noteGroups.length > 1;

      for (const group of noteGroups) {
        let noteStr = group.trim();
        if (noteStr === "") continue;

        let hasDelayMarker = false;
        if (noteStr.startsWith("`")) {
          hasDelayMarker = true;
          noteStr = noteStr.substring(1);
        }

        const parsedNotes = parseNoteString(
          noteStr,
          currentBeat,
          currentMs,
          measure,
          positionInMeasure,
          currentBpm,
          isSimultaneous,
          hasDelayMarker,
        );

        if (currentHiSpeed !== 1) {
          for (const note of parsedNotes) note.hiSpeed = currentHiSpeed;
        }
        notes.push(...parsedNotes);
      }
    }

    currentBeat += beatIncrement;
    currentMs += (60000 * beatIncrement) / currentBpm;

    if (pos < chartBody.length && chartBody[pos] === ",") {
      pos++;
    }
  }

  return {
    notes,
    firstBpm: firstBpm !== null ? firstBpm : initialBpm,
    bpmEvents: bpmEvents.length > 0 ? bpmEvents : [{ timing: 0, bpm: initialBpm }],
    divisorEvents,
  };
}

/**
 * 计算 Hold 音符的持续拍数。
 *
 * 支持 `[divisor:beats]`（按分拍与拍数）和 `[#seconds]`（按绝对秒数基于 BPM 换算）两种格式。
 */
function parseHoldDuration(
  divisor: string | undefined,
  beats: string | undefined,
  seconds: string | undefined,
  bpm: number,
): number {
  if (divisor) {
    return (4 / parseFloat(divisor)) * parseFloat(beats!);
  }
  return (parseFloat(seconds!) * bpm) / 60;
}

/**
 * 解析单个音符字符标记（Tap、Hold、Slide、Touch 等），生成对应的音符对象列表。
 *
 * 若位置超出有效按键或感应区范围，返回空数组。
 */
function parseNoteString(
  noteStr: string,
  timing: number,
  timingMs: number,
  measure: number,
  positionInMeasure: number,
  bpm: number,
  isSimultaneous: boolean,
  hasDelayMarker: boolean,
): Note[] {
  const notes: Note[] = [];
  const delayOffset = hasDelayMarker ? 1 : 0;

  const holdMatch = noteStr.match(/^(\d+)[hbx]{1,3}\[(?:([\d.]+):([\d.]+)|#([\d.]+))\][bx]*$/i);
  if (holdMatch) {
    const position = parseInt(holdMatch[1]) as ButtonPosition;
    const holdDuration = parseHoldDuration(holdMatch[2], holdMatch[3], holdMatch[4], bpm);
    const lowerNoteStr = noteStr.toLowerCase();
    const isBreakHold = lowerNoteStr.includes("b");
    const isEx = lowerNoteStr.includes("x");

    if (position >= 1 && position <= 8) {
      const durationMs = (60000 * holdDuration) / bpm;

      const holdStart: HoldStartNote = {
        position,
        timing,
        timingMs: timingMs + delayOffset,
        type: isSimultaneous ? "hold-start-simultaneous" : "hold-start",
        measure,
        positionInMeasure,
        scale: 1,
        bpm,
        duration: holdDuration,
        isHoldStart: true,
        isEx,
        isBreakHold,
        hasDelayMarker,
      };
      notes.push(holdStart);

      const endTiming = timing + holdDuration;
      const endTimingMs = timingMs + durationMs + delayOffset;
      const endMeasure = Math.floor(endTiming / 4);
      const endPositionInMeasure = Math.floor(((endTiming % 4) / 4) * 512);

      const holdEnd: HoldEndNote = {
        position,
        timing: endTiming,
        timingMs: endTimingMs,
        type: isSimultaneous ? "hold-end-simultaneous" : "hold-end",
        measure: endMeasure,
        positionInMeasure: endPositionInMeasure,
        scale: 1,
        bpm,
        holdStartTiming: timing,
        isHoldEnd: true,
        isEx,
        isBreakHold,
      };
      notes.push(holdEnd);

      return notes;
    }
  }

  const slideMatch = noteStr.match(/^(\d+)([bx?!@]*[-><^vpqszVw*]+.*)$/i);
  if (slideMatch && /[-><^vpqszVw]/i.test(slideMatch[2])) {
    const startPosition = parseInt(slideMatch[1]) as ButtonPosition;
    const slideNotation = slideMatch[2];
    const pathStartIndex = slideNotation.search(/[-><^vpqszVw*]/i);
    const startModifiers =
      pathStartIndex >= 0 ? slideNotation.slice(0, pathStartIndex).toLowerCase() : "";
    // 无头滑条修饰符：'?' 为引导星渐显淡入，'!' 为引导星在启动时刻直接显现
    const headlessMarker = match(startModifiers)
      .when(
        (s) => s.includes("!"),
        () => "!" as const,
      )
      .when(
        (s) => s.includes("?"),
        () => "?" as const,
      )
      .otherwise(() => null);
    const isStartBreak = startModifiers.includes("b");
    const isHeadless = headlessMarker !== null;
    // '@' 修饰符将滑条头部由默认星形替换为普通按键外观
    const hasTapHead = !isHeadless && startModifiers.includes("@");
    const isEx = noteStr.toLowerCase().includes("x");

    const slideParts = slideNotation.split("*");
    const allSlideSegments: SlideSegment[][] = [];
    const allDurations: number[] = [];
    const allDurationMs: number[] = [];
    const allDelayMs: number[] = [];
    const allCustomLengths: (number | null)[] = [];
    const allSlideBreaks: boolean[] = [];

    for (const part of slideParts) {
      const hasBreak = /[-><^vpqszVw]\d*b/i.test(part) || /\]b/i.test(part);
      allSlideBreaks.push(hasBreak);

      const hasMultipleTimings = (part.match(/\[[\d.:#+]+\]/g) || []).length > 1;

      if (hasMultipleTimings) {
        const parseResult = parseSlideSegmentsWithTiming(startPosition, part, bpm);
        allSlideSegments.push(parseResult.segments);
        allDurations.push(parseResult.totalDuration);
        allDurationMs.push(parseResult.totalDurationMs);
        allDelayMs.push(60000 / bpm);
        allCustomLengths.push(null);
      } else {
        let duration = 1;
        let customDelay: number | null = null;
        let customDurationSeconds: number | null = null;
        let customLengthSeconds: number | null = null;

        const secondsMatch = part.match(/\[([\d.]+)##([\d.]+)\]/);
        const secondsOnlyMatch = part.match(/\[#([\d.]+)\]/);
        if (secondsMatch) {
          customDelay = parseFloat(secondsMatch[1]);
          customLengthSeconds = parseFloat(secondsMatch[2]);
          duration = customLengthSeconds;
        } else if (secondsOnlyMatch) {
          customLengthSeconds = parseFloat(secondsOnlyMatch[1]);
          duration = customLengthSeconds;
        } else {
          const timingMatch = part.match(/\[(?:([\d.]+)#)?([\d.]+):([\d.]+)(?:##([\d.]+))?\]/);
          if (timingMatch) {
            if (timingMatch[1]) {
              customDelay = parseFloat(timingMatch[1]);
            }
            duration = (4 / parseFloat(timingMatch[2])) * parseFloat(timingMatch[3]);
            if (timingMatch[4]) {
              customDurationSeconds = parseFloat(timingMatch[4]);
            }
          }
        }

        let durationMsValue: number;
        let delayMsValue: number;

        if (customLengthSeconds !== null) {
          durationMsValue = customLengthSeconds * 1000;
          // '[#X]' 格式未显式指定延迟，沿用标准 1 拍延迟以对齐引导星与拍点
          delayMsValue = customDelay !== null ? customDelay * 1000 : 60000 / bpm;
        } else {
          durationMsValue =
            customDurationSeconds !== null
              ? customDurationSeconds * 1000
              : (60000 * duration) / bpm;
          delayMsValue = customDelay !== null ? 60000 / customDelay : 60000 / bpm;
        }

        allDurations.push(duration);
        allDurationMs.push(durationMsValue);
        allDelayMs.push(delayMsValue);
        allCustomLengths.push(customDurationSeconds);

        const pathOnly = part
          .replace(/\[(?:(?:[\d.]+#)?[\d.]+:[\d.]+(?:##[\d.]+)?|[\d.]+##[\d.]+)\]/gi, "")
          .replace(/[bx]/gi, "");

        const segments = parseSlideSegments(startPosition, pathOnly);
        allSlideSegments.push(segments);
      }
    }

    if (startPosition >= 1 && startPosition <= 8) {
      const slideNote: SlideNote = {
        position: startPosition,
        timing,
        timingMs: timingMs + delayOffset,
        type: "slide",
        measure,
        positionInMeasure,
        scale: 1,
        bpm,
        isHeadless,
        headlessMode: match(headlessMarker)
          .with("!", () => "pop" as const)
          .with("?", () => "fade" as const)
          .with(null, () => undefined)
          .exhaustive(),
        hasTapHead,
        isStartBreak,
        allSlideBreaks,
        isEx,
        duration: allDurations[0],
        durationMs: allDurationMs[0],
        delayMs: allDelayMs[0],
        slideSegments: allSlideSegments[0],
        allSlideSegments,
        allDurations,
        allDurationMs,
        allDelayMs,
        allCustomLengths,
        isSplitSlide: allSlideSegments.length > 1,
        customLength: allCustomLengths[0],
        hasDelayMarker,
      };
      notes.push(slideNote);
      return notes;
    }
  }

  if (isMultiDigitNote(noteStr)) {
    const digits = noteStr.split("");
    let allValid = true;

    for (const digit of digits) {
      const pos = parseInt(digit);
      if (pos < 1 || pos > 8) {
        allValid = false;
        break;
      }
    }

    if (allValid) {
      for (const digit of digits) {
        const position = parseInt(digit) as ButtonPosition;
        const tapNote: TapNote = {
          position,
          timing,
          timingMs: timingMs + delayOffset,
          type: "simultaneous",
          measure,
          positionInMeasure,
          scale: 1,
          bpm,
          hasDelayMarker,
        };
        notes.push(tapNote);
      }
      return notes;
    }
  }

  const touchMatch = noteStr.match(
    /^([ABCDE])(\d*)([hbfx]*)(?:\[(?:([\d.]+):([\d.]+)|#([\d.]+))\])?$/i,
  );
  if (touchMatch) {
    const region = touchMatch[1].toUpperCase();
    const sensorNum = touchMatch[2] ? parseInt(touchMatch[2]) : null;
    const modifiers = touchMatch[3] ? touchMatch[3].toLowerCase() : "";

    let isValidTouch = false;
    if (region === "C") {
      isValidTouch = !sensorNum || sensorNum === 1 || sensorNum === 2;
    } else if (["A", "B", "D", "E"].includes(region)) {
      isValidTouch = sensorNum !== null && sensorNum >= 1 && sensorNum <= 8;
    }

    if (isValidTouch) {
      const touchPosition = (sensorNum ? `${region}${sensorNum}` : region) as TouchPosition;
      const isHold = modifiers.includes("h");
      const hasFirework = modifiers.includes("f");

      if (isHold && (touchMatch[4] || touchMatch[6])) {
        const holdDuration = parseHoldDuration(touchMatch[4], touchMatch[5], touchMatch[6], bpm);
        const durationMs = (60000 * holdDuration) / bpm;

        const touchHoldStart: TouchHoldStartNote = {
          position: touchPosition,
          timing,
          timingMs: timingMs + delayOffset,
          type: "touch-hold-start",
          measure,
          positionInMeasure,
          scale: 1,
          bpm,
          duration: holdDuration,
          durationMs,
          hasFirework,
          isHoldStart: true,
          hasDelayMarker,
        };
        notes.push(touchHoldStart);

        const endTiming = timing + holdDuration;
        const endTimingMs = timingMs + durationMs + delayOffset;
        const endMeasure = Math.floor(endTiming / 4);
        const endPositionInMeasure = Math.floor(((endTiming % 4) / 4) * 512);

        const touchHoldEnd: TouchHoldEndNote = {
          position: touchPosition,
          timing: endTiming,
          timingMs: endTimingMs,
          type: "touch-hold-end",
          measure: endMeasure,
          positionInMeasure: endPositionInMeasure,
          scale: 1,
          bpm,
          holdStartTiming: timing,
          hasFirework,
          isHoldEnd: true,
        };
        notes.push(touchHoldEnd);
      } else {
        const touchNote: TouchNote = {
          position: touchPosition,
          timing,
          timingMs: timingMs + delayOffset,
          type: "touch",
          measure,
          positionInMeasure,
          scale: 1,
          bpm,
          hasFirework,
          hasDelayMarker,
        };
        notes.push(touchNote);
      }
      return notes;
    }
  }

  const tapMatch = noteStr.match(/^(\d+)([bx$]*)$/i);
  if (tapMatch) {
    const position = parseInt(tapMatch[1]);
    const modifiers = tapMatch[2].toLowerCase();
    const starCount = modifiers.split("$").length - 1;
    const isBreak = modifiers.includes("b");
    const isEx = modifiers.includes("x");
    const isStar = starCount > 0;
    const isSpinningStar = starCount >= 2;

    if (position >= 1 && position <= 8) {
      const tapNote: TapNote = {
        position: position as ButtonPosition,
        timing,
        timingMs: timingMs + delayOffset,
        type: isBreak ? "break" : isSimultaneous ? "simultaneous" : "tap",
        measure,
        positionInMeasure,
        scale: 1,
        bpm,
        isStar,
        isSpinningStar,
        isEx,
        hasDelayMarker,
      };
      notes.push(tapNote);
    }
  }

  return notes;
}

interface SlidePathParseResult {
  segments: SlideSegment[];
  segmentDurations: number[];
  segmentDurationMs: number[];
  totalDuration: number;
  totalDurationMs: number;
}

/**
 * 解析包含独立时间标记的复合滑条路径。
 *
 * 逐段解析路径类型与端点，支持 V 字折线推导及多段独立时间（如 `-4[8:5]>3[384:47]`）。
 *
 * @param startPosition - 滑条起始按键位置（1-8）。
 * @param pathNotation - 滑条路径标记字符串。
 * @param defaultBpm - 未声明局部时间时使用的基准 BPM。
 */
function parseSlideSegmentsWithTiming(
  startPosition: number,
  pathNotation: string,
  defaultBpm: number,
): SlidePathParseResult {
  const segments: SlideSegment[] = [];
  const segmentDurations: number[] = [];
  const segmentDurationMs: number[] = [];
  let currentPos = startPosition;
  let i = 0;

  while (i < pathNotation.length) {
    const char = pathNotation[i];
    let pathType: SlidePathType | null = null;

    if (i + 1 < pathNotation.length && pathNotation[i + 1] === char && "pq".includes(char)) {
      pathType = (char + char) as SlidePathType;
      i += 2;
    } else if ("-><^vpqszVw".includes(char)) {
      pathType = char as SlidePathType;
      i++;
    } else {
      i++;
      continue;
    }

    if (pathType === "V") {
      let numStr = "";
      while (i < pathNotation.length && /\d/.test(pathNotation[i])) {
        numStr += pathNotation[i];
        i++;
      }

      if (i < pathNotation.length && pathNotation[i] === "[") {
        const bracketEnd = pathNotation.indexOf("]", i);
        if (bracketEnd !== -1) {
          i = bracketEnd + 1;
        }
      }

      if (numStr.length >= 2) {
        const midPos = parseInt(numStr[0]) as ButtonPosition;
        const endPos = parseInt(numStr.substring(1)) as ButtonPosition;
        const start = currentPos;

        // 标准 V 形状要求拐点位于起点 ±2 键位且终点位于同侧有效跨度内；不满足时退化为两条直线段
        const leftCorner = ((start + 5) % 8) + 1;
        const rightCorner = ((start + 1) % 8) + 1;
        const d = (((endPos - start) % 8) + 8) % 8;
        const isStdV =
          (midPos === leftCorner && d >= 1 && d <= 4) ||
          (midPos === rightCorner && (8 - d) % 8 >= 1 && (8 - d) % 8 <= 4);

        if (isStdV) {
          segments.push({
            type: "V",
            startPos: start as ButtonPosition,
            endPos,
            midPos,
          });
          segmentDurations.push(1);
          segmentDurationMs.push(60000 / defaultBpm);
        } else {
          segments.push({ type: "-", startPos: start as ButtonPosition, endPos: midPos });
          segments.push({ type: "-", startPos: midPos, endPos });
          segmentDurations.push(0.5, 0.5);
          segmentDurationMs.push((60000 * 0.5) / defaultBpm, (60000 * 0.5) / defaultBpm);
        }

        currentPos = endPos;
      }
    } else {
      let numStr = "";
      while (i < pathNotation.length && /\d/.test(pathNotation[i])) {
        numStr += pathNotation[i];
        i++;
      }

      while (i < pathNotation.length && /[bx]/i.test(pathNotation[i])) {
        i++;
      }

      let segDuration = 1;
      let segDurationMs = 60000 / defaultBpm;

      if (i < pathNotation.length && pathNotation[i] === "[") {
        const bracketEnd = pathNotation.indexOf("]", i);
        if (bracketEnd !== -1) {
          const timingStr = pathNotation.substring(i + 1, bracketEnd);

          const secondsMatch = timingStr.match(/^([\d.]+)##([\d.]+)$/);
          const secondsOnlyMatch = timingStr.match(/^#([\d.]+)$/);
          if (secondsMatch) {
            segDuration = parseFloat(secondsMatch[2]);
            segDurationMs = segDuration * 1000;
          } else if (secondsOnlyMatch) {
            segDurationMs = parseFloat(secondsOnlyMatch[1]) * 1000;
            segDuration = (segDurationMs * defaultBpm) / 60000;
          } else {
            const stdMatch = timingStr.match(/^(?:([\d.]+)#)?([\d.]+):([\d.]+)(?:##([\d.]+))?$/);
            if (stdMatch) {
              segDuration = (4 / parseFloat(stdMatch[2])) * parseFloat(stdMatch[3]);
              if (stdMatch[4]) {
                segDurationMs = parseFloat(stdMatch[4]) * 1000;
              } else {
                segDurationMs = (60000 * segDuration) / defaultBpm;
              }
            }
          }

          i = bracketEnd + 1;

          while (i < pathNotation.length && /[bx]/i.test(pathNotation[i])) {
            i++;
          }
        }
      }

      if (numStr) {
        const endPos = parseInt(numStr) as ButtonPosition;
        segments.push({
          type: pathType,
          startPos: currentPos as ButtonPosition,
          endPos: endPos,
        });
        segmentDurations.push(segDuration);
        segmentDurationMs.push(segDurationMs);
        currentPos = endPos;
      }
    }
  }

  const totalDuration = segmentDurations.reduce((a, b) => a + b, 0);
  const totalDurationMs = segmentDurationMs.reduce((a, b) => a + b, 0);

  return {
    segments,
    segmentDurations,
    segmentDurationMs,
    totalDuration,
    totalDurationMs,
  };
}

/**
 * 仅提取滑条路径分段结构（使用 120 BPM 缺省值填充时间占位）。
 */
function parseSlideSegments(startPosition: number, pathNotation: string): SlideSegment[] {
  return parseSlideSegmentsWithTiming(startPosition, pathNotation, 120).segments;
}
