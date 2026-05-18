import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Card, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconCurrentLocation } from '@tabler/icons-react';
import { useGameStore, playbackTimeRef } from '../../stores/useGameStore';
import { ChartDifficulty } from '../../types';
import classes from './SimaiStatementList.module.css';

// 跟 ChartParser 给 chart.notes 加的 1 小节 lead-in 偏移保持一致，让 statement
// beat 与 playbackTimeRef 处于同一坐标系。
const LEAD_IN_BEATS = 4;

interface SimaiChunk {
  text: string;
  beat: number;
}
interface SimaiStatement {
  beat: number;
  chunks: SimaiChunk[];
}

function parseSimaiStatements(simaiText: string, difficulty: ChartDifficulty | null): SimaiStatement[] {
  if (!simaiText || !difficulty) return [];
  const lines = simaiText.split('\n');
  const inoteHeader = `&inote_${difficulty}=`;

  const out: SimaiStatement[] = [];
  let beat = LEAD_IN_BEATS;
  let divisor = 4;
  let inInote = false;

  // 每行 = 一条 statement，行内按 `,` 切成 chunks，每个 chunk 记自己的起始 beat。
  // `,` 推进 beat（步长 = 4 / divisor），`{N}` / `(bpm){N}` 跟 parser 同步更新 divisor。
  const processLine = (content: string) => {
    if (!content.trim()) return;
    const chunks: SimaiChunk[] = [];
    const lineStartBeat = beat;
    let buf = '';
    let bufBeat = beat;
    const flush = () => {
      const t = buf.trim();
      if (t) chunks.push({ text: t, beat: bufBeat });
      buf = '';
      bufBeat = beat;
    };
    let i = 0;
    while (i < content.length) {
      const c = content[i];
      if (c === ',') {
        flush();
        beat += 4 / divisor;
        bufBeat = beat;
        i++;
      } else if (c === '(') {
        const m = content.substring(i).match(/^\((\d+(?:\.\d+)?)\)(\{(\d+(?:\.\d+)?)\})?/);
        if (m) {
          if (m[3]) divisor = parseFloat(m[3]);
          buf += m[0];
          i += m[0].length;
        } else {
          buf += c;
          i++;
        }
      } else if (c === '{') {
        const m = content.substring(i).match(/^\{(\d+(?:\.\d+)?)\}/);
        if (m) {
          divisor = parseFloat(m[1]);
          buf += m[0];
          i += m[0].length;
        } else {
          buf += c;
          i++;
        }
      } else {
        buf += c;
        i++;
      }
    }
    flush();
    if (chunks.length > 0) out.push({ beat: lineStartBeat, chunks });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(inoteHeader.toLowerCase())) {
      inInote = true;
      processLine(line.substring(line.indexOf('=') + 1));
    } else if (trimmed.startsWith('&')) {
      inInote = false;
    } else if (inInote) {
      processLine(line);
    }
  }

  if (out.length === 0 && simaiText.trim()) {
    beat = LEAD_IN_BEATS;
    divisor = 4;
    for (const line of lines) processLine(line);
  }

  return out;
}

interface StatementRowProps {
  statement: SimaiStatement;
  index: number;
  isActive: boolean;
  activeChunkIdx: number;
  seekTo: (beat: number) => void;
  registerRef: (index: number, el: HTMLDivElement | null) => void;
}

const StatementRow = memo(function StatementRow({
  statement, index, isActive, activeChunkIdx, seekTo, registerRef,
}: StatementRowProps) {
  return (
    <div
      ref={(el) => registerRef(index, el)}
      style={{
        padding: '2px 6px',
        backgroundColor: isActive ? 'rgba(255, 215, 0, 0.15)' : undefined,
        borderRadius: 4,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        cursor: 'pointer',
      }}
      onClick={() => seekTo(statement.beat)}
    >
      <span style={{ opacity: 0.5, minWidth: 48, textAlign: 'right', flexShrink: 0 }}>
        {statement.beat.toFixed(2)}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 2, minWidth: 0, flex: 1 }}>
        {statement.chunks.map((c, ci) => {
          const isActiveChunk = isActive && ci === activeChunkIdx;
          return (
            <span
              key={ci}
              title={`beat ${c.beat.toFixed(3)} — click to seek`}
              onClick={(e) => { e.stopPropagation(); seekTo(c.beat); }}
              style={{
                padding: '0 4px',
                borderRadius: 3,
                backgroundColor: isActiveChunk ? 'rgba(255, 215, 0, 0.55)' : undefined,
                borderLeft: ci === 0 ? undefined : '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer',
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
              }}
            >
              {c.text}
            </span>
          );
        })}
      </span>
    </div>
  );
});

export function SimaiStatementList({
  simaiText,
  difficulty,
}: {
  simaiText: string;
  difficulty: ChartDifficulty | null;
}) {
  const statements = useMemo(() => parseSimaiStatements(simaiText, difficulty), [simaiText, difficulty]);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const preciseTime = useGameStore((s) => s.timeline.preciseTime);
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);

  const seekTo = useCallback((beat: number) => {
    playbackTimeRef.current = beat;
    setPreciseTime(beat, true);
  }, [setPreciseTime]);

  const [active, setActive] = useState<{ line: number; chunk: number }>({ line: -1, chunk: -1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    itemRefs.current[index] = el;
  }, []);

  // 每帧用最后一个 statement.beat <= curBeat 定位"刚刚通过"的 statement。空白/标记行
  // 自然命中。curBeat 在第一个 statement 之前则锁定到第一个 statement。
  useEffect(() => {
    let raf: number | null = null;
    let lastLine = -1;
    let lastChunk = -1;
    const findChunkAt = (lineIdx: number, beat: number) => {
      if (lineIdx < 0) return -1;
      const chunks = statements[lineIdx].chunks;
      let lo = 0;
      let hi = chunks.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (chunks[mid].beat <= beat) lo = mid + 1;
        else hi = mid;
      }
      return lo - 1;
    };
    const findLineAt = (beat: number) => {
      let lo = 0;
      let hi = statements.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (statements[mid].beat <= beat) lo = mid + 1;
        else hi = mid;
      }
      return lo - 1;
    };
    const tick = () => {
      const curBeat = isPlaying ? playbackTimeRef.current : preciseTime;
      let lineIdx = findLineAt(curBeat);
      if (lineIdx < 0 && statements.length > 0) lineIdx = 0;
      const chunkIdx = findChunkAt(lineIdx, curBeat);
      if (lineIdx !== lastLine || chunkIdx !== lastChunk) {
        lastLine = lineIdx;
        lastChunk = chunkIdx;
        setActive({ line: lineIdx, chunk: chunkIdx });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf !== null) cancelAnimationFrame(raf); };
  }, [statements, isPlaying, preciseTime]);

  // 用户用 wheel/touch 滚动后停止自动跟随，按下"居中"按钮恢复。
  const [autoScroll, setAutoScroll] = useState(true);
  const pauseAutoScroll = useCallback(() => setAutoScroll(false), []);

  const centerActive = useCallback(() => {
    const el = itemRefs.current[active.line];
    const container = containerRef.current;
    if (!el || !container) return;
    const target = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [active.line]);

  // 活跃行变化 / 重新启用 autoScroll 时居中。
  useEffect(() => {
    if (autoScroll) centerActive();
  }, [autoScroll, centerActive]);

  if (statements.length === 0) return null;

  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>Simai 语句</Text>
          <Tooltip label="恢复自动滚动">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              disabled={autoScroll}
              onClick={() => setAutoScroll(true)}
            >
              <IconCurrentLocation size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <ScrollArea
          h={240}
          viewportRef={containerRef}
          onWheel={pauseAutoScroll}
          onTouchMove={pauseAutoScroll}
          styles={{ viewport: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55 } }}
        >
          {statements.map((s, i) => {
            const isActive = i === active.line;
            return (
              <StatementRow
                key={i}
                statement={s}
                index={i}
                isActive={isActive}
                activeChunkIdx={isActive ? active.chunk : -1}
                seekTo={seekTo}
                registerRef={registerRef}
              />
            );
          })}
        </ScrollArea>
      </Stack>
    </Card>
  );
}

export default SimaiStatementList;
