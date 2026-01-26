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
} from '../../types';

interface ParseNotesResult {
  notes: Note[];
  firstBpm: number;
  bpmEvents: BpmEvent[];
  divisorEvents: DivisorEvent[];
}

export function getAvailableDifficulties(simaiText: string): AvailableDifficulties {
  const available: AvailableDifficulties = {};
  
  // 检查 &inote_X
  for (let i = 1; i <= 6; i++) {
    const pattern = new RegExp(`&inote_${i}=`, 'i');
    if (pattern.test(simaiText)) {
      available[i as ChartDifficulty] = true;
    }
  }
  
  // 如果没有找到 inote 段，假设它是单难度谱面
  if (Object.keys(available).length === 0) {
    // 检查是否有谱面内容（不只是元数据）
    const hasChartContent = /[1-8]/.test(simaiText.replace(/&[^=]+=.*$/gm, ''));
    if (hasChartContent) {
      available[4] = true; // 默认 MASTER
    }
  }
  
  return available;
}

export function parseSimaiChart(simaiText: string, difficulty?: ChartDifficulty): Chart {
  if (!simaiText || typeof simaiText !== 'string') {
    throw new Error('Invalid input: expected a non-empty string');
  }

  if (!/[0-9,\(\)\{\}\/\n&\-><^vpqszVwhb\[\]:\.=\s]/.test(simaiText)) {
    throw new Error(
      'Invalid simai format: expected digits, commas, brackets, and note markers'
    );
  }

  const lines = simaiText.split('\n');
  const metadata: ChartMetadata = {
    bpm: 120,
    title: '',
    artist: '',
    designer: '',
    level: {},
    designers: {},
    availableDifficulties: {},
    inotes: {},
  };

  // 第一遍：收集所有元数据和 inote 段
  let currentInote: number | null = null;
  let currentInoteContent: string[] = [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 检查 &inote_X= 开始
      const inoteMatch = trimmedLine.match(/^&inote_(\d)=(.*)$/i);
      if (inoteMatch) {
        // 保存上一个 inote 如果存在
        if (currentInote !== null) {
          metadata.inotes[currentInote] = currentInoteContent.join('\n');
          metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
        }
        
        currentInote = parseInt(inoteMatch[1]);
        currentInoteContent = inoteMatch[2] ? [inoteMatch[2]] : [];
        continue;
      }
      
      // 如果我们在 inote 段
      if (currentInote !== null) {
        // 检查这行是否开始一个新的元数据段
        if (trimmedLine.startsWith('&') && !trimmedLine.startsWith('&inote')) {
          // 保存当前 inote 并退出 inote 模式
          metadata.inotes[currentInote] = currentInoteContent.join('\n');
          metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
          currentInote = null;
          currentInoteContent = [];
          
          // 解析这行元数据
          parseMetadataLine(trimmedLine, metadata);
        } else if (!trimmedLine.startsWith('&')) {
          // 添加到当前 inote 内容
          currentInoteContent.push(line);
        }
        continue;
      }
      
      // 解析常规元数据行
      if (trimmedLine.startsWith('&')) {
        parseMetadataLine(trimmedLine, metadata);
      }
    }
    
    // 保存最后一个 inote 如果存在
    if (currentInote !== null) {
      metadata.inotes[currentInote] = currentInoteContent.join('\n');
      metadata.availableDifficulties[currentInote as ChartDifficulty] = true;
    }

    // 确定要解析的难度
    let selectedDifficulty = difficulty;
    const availableDiffs = Object.keys(metadata.inotes).map(Number).sort((a, b) => b - a);
    
    if (!selectedDifficulty && availableDiffs.length > 0) {
      // 默认最高可用难度
      selectedDifficulty = availableDiffs[0] as ChartDifficulty;
    }
    
    // 从 inote 或使用整个文本（用于单难度谱面）
    let chartBody = '';
    
    if (selectedDifficulty && metadata.inotes[selectedDifficulty]) {
      chartBody = metadata.inotes[selectedDifficulty];
    } else if (availableDiffs.length === 0) {
      // 没有 inote 段 - 将整个文件视为谱面内容（旧格式）
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('&')) continue;
        chartBody += line;
      }
      // 标记为可用（旧格式默认 MASTER）
      metadata.availableDifficulties[4] = true;
      selectedDifficulty = 4;
    } else {
      throw new Error(`Difficulty ${difficulty} not found in chart. Available: ${availableDiffs.join(', ')}`);
    }
    
    // 获取选定难度的谱师
    const designerKey = `des_${selectedDifficulty}` as keyof ChartDesigners;
    const selectedDesigner = metadata.designers[designerKey] || metadata.designer;

    // 解析谱面内容中的 Note
    const parseResult = parseNotes(chartBody, metadata.bpm);
    const notes = parseResult.notes;
    const bpmEvents = parseResult.bpmEvents;
    const divisorEvents = parseResult.divisorEvents;
    metadata.bpm = parseResult.firstBpm;

    // 根据 Note 节拍计算总小节数
    let maxMeasure = 0;
    let maxTiming = 0;

    for (const note of notes) {
      if (note.measure > maxMeasure) {
        maxMeasure = note.measure;
      }

      let endTiming = note.timing;

      // 考虑 Hold 持续时间
      if ('isHoldStart' in note && note.isHoldStart && 'duration' in note) {
        endTiming = note.timing + note.duration;
      }

      // 考虑滑条持续时间
      if (note.type === 'slide') {
        const slideNote = note as SlideNote;
        if (slideNote.allDurations && slideNote.allDurations.length > 0) {
          const maxDuration = Math.max(...slideNote.allDurations);
          endTiming = note.timing + 1 + maxDuration;
        } else {
          endTiming = note.timing + 1 + slideNote.duration;
        }
      }

      // 考虑触摸 Hold 持续时间
      if (note.type === 'touch-hold-start') {
        const touchHold = note as TouchHoldStartNote;
        if (touchHold.duration !== undefined) {
          endTiming = note.timing + touchHold.duration;
        }
      }

      if (endTiming > maxTiming) {
        maxTiming = endTiming;
      }
    }

    // 确保我们有足够的小节容纳所有 Note
    const measuresFromTiming = Math.ceil(maxTiming / 4);
    maxMeasure = Math.max(maxMeasure, measuresFromTiming);

    // 在开始时添加 1 小节偏移（用于前奏时间）
    const leadInMs = (60000 * 4) / parseResult.firstBpm;

    for (const note of notes) {
      note.measure += 1;
      note.timing += 4;
      note.timingMs += leadInMs;

      if ('holdStartTiming' in note && note.holdStartTiming !== undefined) {
        (note as HoldEndNote | TouchHoldEndNote).holdStartTiming += 4;
      }
    }

    for (const event of bpmEvents) {
      event.timing += 4;
    }
    // 在开始时添加初始 BPM（用于前奏时间）
    // 使用 firstBpm（谱面中第一个 BPM）作为前奏期间的 BPM，与 leadInMs 计算保持一致
    bpmEvents.unshift({ timing: 0, bpm: parseResult.firstBpm });

    // 调整拍子变化事件节拍
    for (const event of divisorEvents) {
      event.timing += 4;
    }
    // 在开始时添加默认拍子（用于前奏时间）
    divisorEvents.unshift({ timing: 0, divisor: 4 });
    // 排序以确保正确的顺序用于查找
    divisorEvents.sort((a, b) => a.timing - b.timing);

    return {
      // 使用 firstBpm 作为基准 BPM，与前奏和 bpmEvents 保持一致
      bpm: parseResult.firstBpm,
      title: metadata.title,
      artist: metadata.artist,
      designer: selectedDesigner,
      level: metadata.level,
      designers: metadata.designers,
      difficulty: selectedDifficulty,
      availableDifficulties: metadata.availableDifficulties,
      measures: maxMeasure + 2, // +2 for lead-in and tail（前奏和尾奏）
      notes,
      bpmEvents,
      divisorEvents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Parse error: ${message}`);
  }
}

function parseMetadataLine(line: string, metadata: ChartMetadata): void {
  // 通过找到第一个 = 处理多行值
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) return;
  
  const key = line.substring(1, eqIndex).trim();
  const value = line.substring(eqIndex + 1).trim();

  switch (key) {
    case 'title':
      metadata.title = value;
      break;
    case 'artist':
      metadata.artist = value;
      break;
    case 'des':
      metadata.designer = value;
      break;
    case 'des_1':
    case 'des_2':
    case 'des_3':
    case 'des_4':
    case 'des_5':
    case 'des_6':
      metadata.designers[key as keyof ChartDesigners] = value;
      break;
    case 'lv_1':
    case 'lv_2':
    case 'lv_3':
    case 'lv_4':
    case 'lv_5':
    case 'lv_6':
      metadata.level[key as keyof ChartLevels] = value;
      break;
    case 'bpm':
      const bpmVal = parseFloat(value);
      if (!isNaN(bpmVal)) {
        metadata.bpm = bpmVal;
      }
      break;
  }
}

function parseNotes(chartBody: string, initialBpm: number): ParseNotesResult {
  const notes: Note[] = [];
  const bpmEvents: BpmEvent[] = [];
  const divisorEvents: DivisorEvent[] = [];

  let currentBpm = initialBpm;
  let firstBpm: number | null = null;
  let divisor = 4; // 拍子数
  let currentBeat = 0; // 当前节拍
  let currentMs = 0; // 当前时间（毫秒）

  let pos = 0;
  
  const skipWhitespace = () => {
    while (pos < chartBody.length && /[\s\r\n]/.test(chartBody[pos])) {
      pos++;
    }
  };

  while (pos < chartBody.length) {
    // 跳过空白字符
    skipWhitespace();
    if (pos >= chartBody.length) break;
    // 检查 BPM 变化并带有拍子数：(bpm){divisor}
    const bpmDivisorMatch = chartBody.substring(pos).match(
      /^\((\d+(?:\.\d+)?)\)\{(\d+(?:\.\d+)?)\}/
    );
    if (bpmDivisorMatch) {
      currentBpm = parseFloat(bpmDivisorMatch[1]);
      if (firstBpm === null) firstBpm = currentBpm;
      bpmEvents.push({ timing: currentBeat, bpm: currentBpm });
      const newDivisor = parseFloat(bpmDivisorMatch[2]);
      if (newDivisor !== divisor) {
        divisor = newDivisor;
        divisorEvents.push({ timing: currentBeat, divisor });
      }
      pos += bpmDivisorMatch[0].length;
      continue;
    }

    // 检查 BPM 变化：(bpm)
    const bpmMatch = chartBody.substring(pos).match(/^\((\d+(?:\.\d+)?)\)/);
    if (bpmMatch) {
      currentBpm = parseFloat(bpmMatch[1]);
      if (firstBpm === null) firstBpm = currentBpm;
      bpmEvents.push({ timing: currentBeat, bpm: currentBpm });
      pos += bpmMatch[0].length;
      continue;
    }

    // 检查拍子数变化：{divisor}
    const divisorMatch = chartBody.substring(pos).match(/^\{(\d+(?:\.\d+)?)\}/);
    if (divisorMatch) {
      const newDivisor = parseFloat(divisorMatch[1]);
      if (newDivisor !== divisor) {
        divisor = newDivisor;
        divisorEvents.push({ timing: currentBeat, divisor });
      }
      pos += divisorMatch[0].length;
      continue;
    }

    // 收集内容直到下一个逗号
    let noteContent = '';
    const startPos = pos;

    while (pos < chartBody.length && chartBody[pos] !== ',') {
      const char = chartBody[pos];
      // 如果遇到节拍变化标记，停止
      if (char === '(' || char === '{') break;
      // 跳过空白字符（空格、换行、制表符、回车符）
      if (/[\s\r\n]/.test(char)) {
        pos++;
        continue;
      }
      noteContent += char;
      pos++;
    }

    // 如果没前进并遇到特殊字符，跳过
    if (pos === startPos && pos < chartBody.length && chartBody[pos] !== ',') {
      pos++;
      continue;
    }

    // 计算节拍增量
    const beatIncrement = 4 / divisor;

    // 解析节拍内的 Note
    if (noteContent.trim() !== '') {
      const measure = Math.floor(currentBeat / 4);
      const positionInMeasure = Math.floor((currentBeat % 4) / 4 * 512);

      // 按同时按下 Note 分隔符（反引号或斜杠）分割
      const noteGroups: string[] = [];
      let currentGroup = '';

      for (let i = 0; i < noteContent.length; i++) {
        if (noteContent[i] === '`') {
          if (currentGroup.trim() !== '') {
            noteGroups.push(currentGroup.trim());
          }
          currentGroup = '`';
        } else if (noteContent[i] === '/') {
          if (currentGroup.trim() !== '') {
            noteGroups.push(currentGroup.trim());
          }
          currentGroup = '';
        } else {
          currentGroup += noteContent[i];
        }
      }
      if (currentGroup.trim() !== '') {
        noteGroups.push(currentGroup.trim());
      }

      const isSimultaneous = noteGroups.length > 1;

      // 解析每个 Note 组
      for (const group of noteGroups) {
        let noteStr = group.trim();
        if (noteStr === '') continue;

        // 检查延迟标记
        let hasDelayMarker = false;
        if (noteStr.startsWith('`')) {
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
          hasDelayMarker
        );

        notes.push(...parsedNotes);
      }
    }

    // 前进节拍
    currentBeat += beatIncrement;
    currentMs += (60000 * beatIncrement) / currentBpm;

    // 跳过逗号
    if (pos < chartBody.length && chartBody[pos] === ',') {
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

function parseNoteString(
  noteStr: string,
  timing: number,
  timingMs: number,
  measure: number,
  positionInMeasure: number,
  bpm: number,
  isSimultaneous: boolean,
  hasDelayMarker: boolean
): Note[] {
  const notes: Note[] = [];
  const delayOffset = hasDelayMarker ? 1 : 0; // 反引号延迟 1 毫秒

  // 尝试匹配 Hold Note 模式：1h[4:1] 或 1hb[4:1]
  const holdMatch = noteStr.match(/^(\d+)[hbx]{1,3}\[([\d.]+):([\d.]+)\][bx]*$/i);
  if (holdMatch) {
    const position = parseInt(holdMatch[1]) as ButtonPosition;
    const holdDuration = (4 / parseFloat(holdMatch[2])) * parseFloat(holdMatch[3]);
    const isBreakHold = /b/i.test(noteStr);
    const isEx = /x/i.test(noteStr);

    if (position >= 1 && position <= 8) {
      const durationMs = (60000 * holdDuration) / bpm;

      // 创建 Hold Start Note
      const holdStart: HoldStartNote = {
        position,
        timing,
        timingMs: timingMs + delayOffset,
        type: isSimultaneous ? 'hold-start-simultaneous' : 'hold-start',
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

      // 创建 Hold End Note
      const endTiming = timing + holdDuration;
      const endTimingMs = timingMs + durationMs + delayOffset;
      const endMeasure = Math.floor(endTiming / 4);
      const endPositionInMeasure = Math.floor((endTiming % 4) / 4 * 512);

      const holdEnd: HoldEndNote = {
        position,
        timing: endTiming,
        timingMs: endTimingMs,
        type: isSimultaneous ? 'hold-end-simultaneous' : 'hold-end',
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

  // 尝试匹配滑条模式：1-5[4:1] 或 1b-5[4:1] 或复杂模式：1-4[8:5]>3[384:47]...
  const slideMatch = noteStr.match(/^(\d+)([bx]*[-><^vpqszVw*]+.*)$/i);
  if (slideMatch && /[-><^vpqszVw]/i.test(slideMatch[2])) {
    const startPosition = parseInt(slideMatch[1]) as ButtonPosition;
    const slideNotation = slideMatch[2];
    const isStartBreak = !!noteStr.match(/^(\d+)[bx]*b[x]*[-><^vpqszVw]/i);
    const isEx = /x/i.test(noteStr);

    // 按 * 分割滑条
    const slideParts = slideNotation.split('*');
    const allSlideSegments: SlideSegment[][] = [];
    const allDurations: number[] = [];
    const allDurationMs: number[] = [];
    const allDelayMs: number[] = [];
    const allCustomLengths: (number | null)[] = [];
    const allSlideBreaks: boolean[] = [];

    for (const part of slideParts) {
      // 检查此路径是否有滑条中断
      const hasBreak = /[-><^vpqszVw]\d*b/i.test(part) || /\]b/i.test(part);
      allSlideBreaks.push(hasBreak);

      // 检查此路径是否有多个段和节拍
      // 复杂路径有模式：-4[8:5]>3[384:47]-6[8:7]...
      const hasMultipleTimings = (part.match(/\[[\d.:#+]+\]/g) || []).length > 1;
      
      if (hasMultipleTimings) {
        // 使用新的节拍感知解析器解析复杂路径
        const parseResult = parseSlideSegmentsWithTiming(startPosition, part, bpm);
        allSlideSegments.push(parseResult.segments);
        allDurations.push(parseResult.totalDuration);
        allDurationMs.push(parseResult.totalDurationMs);
        allDelayMs.push(60000 / bpm); // 默认延迟
        allCustomLengths.push(null);
      } else {
        // 简单路径，单节拍
        let duration = 1;
        let customDelay: number | null = null;
        let customDurationSeconds: number | null = null;
        let customLengthSeconds: number | null = null;

        // 解析节拍：[a##b] 秒
        const secondsMatch = part.match(/\[([\d.]+)##([\d.]+)\]/);
        if (secondsMatch) {
          customDelay = parseFloat(secondsMatch[1]);
          customLengthSeconds = parseFloat(secondsMatch[2]);
          duration = customLengthSeconds;
        } else {
          // 解析节拍：[delay#a:b##length] 或 [a:b]
          const timingMatch = part.match(
            /\[(?:([\d.]+)#)?([\d.]+):([\d.]+)(?:##([\d.]+))?\]/
          );
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

        // 计算持续时间
        let durationMsValue: number;
        let delayMsValue: number;

        if (customLengthSeconds !== null) {
          durationMsValue = customLengthSeconds * 1000;
          delayMsValue = (customDelay !== null ? customDelay : 0) * 1000;
        } else {
          const effectiveBpm = customDelay !== null ? customDelay : bpm;
          durationMsValue = (60000 * duration) / (customDurationSeconds !== null ? 1000 / customDurationSeconds : bpm);
          delayMsValue = 60000 / effectiveBpm;
          
          // 如果有自定义值，重新计算
          if (customDurationSeconds === null) {
            durationMsValue = (60000 * duration) / bpm;
          } else {
            durationMsValue = customDurationSeconds * 1000;
          }
          if (customDelay === null) {
            delayMsValue = 60000 / bpm;
          }
        }

        allDurations.push(duration);
        allDurationMs.push(durationMsValue);
        allDelayMs.push(delayMsValue);
        allCustomLengths.push(customDurationSeconds);

        // 解析滑条路径（移除节拍标记和修饰符）
        const pathOnly = part
          .replace(/\[(?:(?:[\d.]+#)?[\d.]+:[\d.]+(?:##[\d.]+)?|[\d.]+##[\d.]+)\]/gi, '')
          .replace(/[bx]/gi, '');
        
        const segments = parseSlideSegments(startPosition, pathOnly);
        allSlideSegments.push(segments);
      }
    }

    if (startPosition >= 1 && startPosition <= 8) {
      const slideNote: SlideNote = {
        position: startPosition,
        timing,
        timingMs: timingMs + delayOffset,
        type: 'slide',
        measure,
        positionInMeasure,
        scale: 1,
        bpm,
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

  // 尝试匹配多个同时按下：12 或 135
  if (/^\d{2,}$/.test(noteStr)) {
    const digits = noteStr.split('');
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
          type: 'simultaneous',
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

  // 尝试匹配触摸 Note：A1, B5h[4:1], C1f, etc.
  const touchMatch = noteStr.match(
    /^([ABCDE])(\d*)([hbfx]*)(?:\[([\d.]+):([\d.]+)\])?$/i
  );
  if (touchMatch) {
    const region = touchMatch[1].toUpperCase();
    const sensorNum = touchMatch[2] ? parseInt(touchMatch[2]) : null;
    const modifiers = touchMatch[3] ? touchMatch[3].toLowerCase() : '';

    // 验证触摸位置
    let isValidTouch = false;
    if (region === 'C') {
      isValidTouch = !sensorNum || sensorNum === 1 || sensorNum === 2;
    } else if (['A', 'B', 'D', 'E'].includes(region)) {
      isValidTouch = sensorNum !== null && sensorNum >= 1 && sensorNum <= 8;
    }

    if (isValidTouch) {
      const touchPosition = sensorNum ? `${region}${sensorNum}` : region;
      const isHold = modifiers.includes('h');
      const hasFirework = modifiers.includes('f');

      if (isHold && touchMatch[4] && touchMatch[5]) {
        // 触摸 Hold
        const holdDuration = (4 / parseFloat(touchMatch[4])) * parseFloat(touchMatch[5]);
        const durationMs = (60000 * holdDuration) / bpm;

        const touchHoldStart: TouchHoldStartNote = {
          position: touchPosition,
          timing,
          timingMs: timingMs + delayOffset,
          type: 'touch-hold-start',
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
        const endPositionInMeasure = Math.floor((endTiming % 4) / 4 * 512);

        const touchHoldEnd: TouchHoldEndNote = {
          position: touchPosition,
          timing: endTiming,
          timingMs: endTimingMs,
          type: 'touch-hold-end',
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
        // 普通触摸
        const touchNote: TouchNote = {
          position: touchPosition,
          timing,
          timingMs: timingMs + delayOffset,
          type: 'touch',
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

  // 尝试匹配简单按下/中断：1, 1b, 1x, 1bx
  const isBreak = /b/i.test(noteStr);
  const isEx = /x/i.test(noteStr);
  const positionOnly = noteStr.replace(/[bx]/gi, '');
  const position = parseInt(positionOnly);

  if (position >= 1 && position <= 8) {
    const tapNote: TapNote = {
      position: position as ButtonPosition,
      timing,
      timingMs: timingMs + delayOffset,
      type: isBreak ? 'break' : isSimultaneous ? 'simultaneous' : 'tap',
      measure,
      positionInMeasure,
      scale: 1,
      bpm,
      isEx,
      hasDelayMarker,
    };
    notes.push(tapNote);
  }

  return notes;
}

interface SlidePathParseResult {
  segments: SlideSegment[];
  segmentDurations: number[]; // 每个段的持续时间（节拍）
  segmentDurationMs: number[]; // 每个段的持续时间（毫秒）
  totalDuration: number; // 总持续时间（节拍）
  totalDurationMs: number; // 总持续时间（毫秒）
}

function parseSlideSegmentsWithTiming(
  startPosition: number, 
  pathNotation: string,
  defaultBpm: number
): SlidePathParseResult {
  const segments: SlideSegment[] = [];
  const segmentDurations: number[] = [];
  const segmentDurationMs: number[] = [];
  let currentPos = startPosition;
  let i = 0;

  while (i < pathNotation.length) {
    const char = pathNotation[i];
    let pathType: SlidePathType | null = null;

    // 检查双字符（pp, qq）
    if (i + 1 < pathNotation.length && pathNotation[i + 1] === char && 'pq'.includes(char)) {
      pathType = (char + char) as SlidePathType;
      i += 2;
    } else if ('-><^vpqszVw'.includes(char)) {
      pathType = char as SlidePathType;
      i++;
    } else {
      i++;
      continue;
    }

    // V-滑条特殊处理（有中间位置）
    if (pathType === 'V') {
      let numStr = '';
      while (i < pathNotation.length && /\d/.test(pathNotation[i])) {
        numStr += pathNotation[i];
        i++;
      }

      // 跳过 V-滑条数字后的节拍标记
      if (i < pathNotation.length && pathNotation[i] === '[') {
        const bracketEnd = pathNotation.indexOf(']', i);
        if (bracketEnd !== -1) {
          i = bracketEnd + 1;
        }
      }

      if (numStr.length >= 2) {
        const midPos = parseInt(numStr[0]) as ButtonPosition;
        const endPos = parseInt(numStr.substring(1)) as ButtonPosition;

        // V-滑条是两个直线段 - 平分持续时间
        segments.push({
          type: '-',
          startPos: currentPos as ButtonPosition,
          endPos: midPos,
        });
        segments.push({
          type: '-',
          startPos: midPos,
          endPos: endPos,
        });
        
        // V-滑条段的默认持续时间
        segmentDurations.push(0.5, 0.5);
        segmentDurationMs.push(60000 * 0.5 / defaultBpm, 60000 * 0.5 / defaultBpm);
        
        currentPos = endPos;
      }
    } else {
      // 解析结束位置（可能包含中断/EX 标记，如 4b）
      let numStr = '';
      while (i < pathNotation.length && /\d/.test(pathNotation[i])) {
        numStr += pathNotation[i];
        i++;
      }

      // 跳过位置后的修饰符（如中断的 'b'）
      while (i < pathNotation.length && /[bx]/i.test(pathNotation[i])) {
        i++;
      }

      // 解析节拍标记：[a:b] 或 [delay#a:b] 或 [a##b]
      let segDuration = 1; // 默认 1 节拍
      let segDurationMs = 60000 / defaultBpm;

      if (i < pathNotation.length && pathNotation[i] === '[') {
        const bracketEnd = pathNotation.indexOf(']', i);
        if (bracketEnd !== -1) {
          const timingStr = pathNotation.substring(i + 1, bracketEnd);
          
          // 检查秒数标记：a##b
          const secondsMatch = timingStr.match(/^([\d.]+)##([\d.]+)$/);
          if (secondsMatch) {
            // 延迟##持续时间（秒）
            segDuration = parseFloat(secondsMatch[2]);
            segDurationMs = segDuration * 1000;
          } else {
            // 检查标准标记：[delay#]a:b[##length]
            const stdMatch = timingStr.match(/^(?:([\d.]+)#)?([\d.]+):([\d.]+)(?:##([\d.]+))?$/);
            if (stdMatch) {
              segDuration = (4 / parseFloat(stdMatch[2])) * parseFloat(stdMatch[3]);
              if (stdMatch[4]) {
                // 自定义长度（秒）
                segDurationMs = parseFloat(stdMatch[4]) * 1000;
              } else {
                segDurationMs = (60000 * segDuration) / defaultBpm;
              }
            }
          }
          
          i = bracketEnd + 1;
          
          // 跳过节拍后的修饰符（如中断的 'b'）
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

  // 计算总数
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

function parseSlideSegments(startPosition: number, pathNotation: string): SlideSegment[] {
  return parseSlideSegmentsWithTiming(startPosition, pathNotation, 120).segments;
}

export default parseSimaiChart;
