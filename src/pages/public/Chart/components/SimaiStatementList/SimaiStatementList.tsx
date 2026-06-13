import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Card,
  Collapse,
  Group,
  ScrollArea,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconCurrentLocation, IconListNumbers } from "@tabler/icons-react";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import type { ChartDifficulty } from "@lxns-network/maimai-chart-engine";
import classes from "./SimaiStatementList.module.css";

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

function parseSimaiStatements(
  simaiText: string,
  difficulty: ChartDifficulty | null,
): SimaiStatement[] {
  if (!simaiText) return [];
  const lines = simaiText.split("\n");
  const inoteHeader = difficulty ? `&inote_${difficulty}=` : null;
  const out: SimaiStatement[] = [];
  let beat = LEAD_IN_BEATS;
  let divisor = 4;
  let inInote = false;

  const processLine = (content: string) => {
    if (!content.trim()) return;
    const chunks: SimaiChunk[] = [];
    const lineStartBeat = beat;
    let buf = "";
    let bufBeat = beat;

    const flush = () => {
      const text = buf.trim();
      if (text) chunks.push({ text, beat: bufBeat });
      buf = "";
      bufBeat = beat;
    };

    let i = 0;
    while (i < content.length) {
      const c = content[i];
      if (c === ",") {
        flush();
        beat += 4 / divisor;
        bufBeat = beat;
        i++;
      } else if (c === "(") {
        const m = content.substring(i).match(/^\((\d+(?:\.\d+)?)\)(\{(\d+(?:\.\d+)?)\})?/);
        if (m) {
          if (m[3]) divisor = parseFloat(m[3]);
          buf += m[0];
          i += m[0].length;
        } else {
          buf += c;
          i++;
        }
      } else if (c === "{") {
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
    if (inoteHeader && trimmed.toLowerCase().startsWith(inoteHeader.toLowerCase())) {
      inInote = true;
      processLine(line.substring(line.indexOf("=") + 1));
    } else if (trimmed.startsWith("&")) {
      inInote = false;
    } else if (inInote || !difficulty) {
      processLine(line);
    }
  }

  if (out.length === 0 && simaiText.trim()) {
    beat = LEAD_IN_BEATS;
    divisor = 4;
    for (const line of lines) {
      if (!line.trim().startsWith("&")) processLine(line);
    }
  }

  return out;
}

interface StatementRowProps {
  statement: SimaiStatement;
  index: number;
  isActive: boolean;
  activeChunkIdx: number;
  isMarkerOnly: boolean;
  seekTo: (beat: number) => void;
  registerRef: (index: number, el: HTMLDivElement | null) => void;
}

// chunk 只包含 BPM/divisor 标记（`(120)` / `{8}` / `(120){8}`）而没有 note 时，视为 marker-only。
const MARKER_ONLY_RE = /^[({][^a-zA-Z0-9/]*[\d.]+[)}](\{[\d.]+\})?$/;

const StatementRow = memo(function StatementRow({
  statement,
  index,
  isActive,
  activeChunkIdx,
  isMarkerOnly,
  seekTo,
  registerRef,
}: StatementRowProps) {
  const rowClass = [classes.row, isActive && classes.rowActive, isMarkerOnly && classes.rowMarker]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={(el) => registerRef(index, el)}
      className={rowClass}
      onClick={() => seekTo(statement.beat)}
    >
      <span className={classes.beat}>{statement.beat.toFixed(2)}</span>
      <span className={classes.chunks}>
        {statement.chunks.map((c, ci) => {
          const isActiveChunk = isActive && ci === activeChunkIdx;
          return (
            <span
              key={ci}
              className={`${classes.chunk}${isActiveChunk ? ` ${classes.chunkActive}` : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                seekTo(c.beat);
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
  const statements = useMemo(
    () => parseSimaiStatements(simaiText, difficulty),
    [simaiText, difficulty],
  );
  const chunkLocations = useMemo(
    () =>
      statements.flatMap((statement, line) =>
        statement.chunks.map((chunk, chunkIndex) => ({
          beat: chunk.beat,
          line,
          chunk: chunkIndex,
        })),
      ),
    [statements],
  );
  const markerFlags = useMemo(
    () => statements.map((s) => s.chunks.every((c) => MARKER_ONLY_RE.test(c.text.trim()))),
    [statements],
  );
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);

  const seekTo = useCallback(
    (beat: number) => {
      playbackTimeRef.current = beat;
      setPreciseTime(beat, true);
    },
    [setPreciseTime],
  );

  const [active, setActive] = useState<{ line: number; chunk: number }>({ line: -1, chunk: -1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    itemRefs.current[index] = el;
  }, []);

  // 折叠状态（默认收起）。收起时跳过 rAF 跟踪，相当于功能开关。
  const [expanded, setExpanded] = useState(false);

  // 每帧用最后一个 statement.beat <= curBeat 定位"刚刚通过"的 statement。空白/标记行
  // 自然命中。curBeat 在第一个 statement 之前则锁定到第一个 statement。
  useEffect(() => {
    if (!expanded) {
      // 收起：清空 active，避免下次展开时残留旧高亮。
      setActive({ line: -1, chunk: -1 });
      return;
    }
    let raf: number | null = null;
    let lastLine = -1;
    let lastChunk = -1;
    let lastBeat = -1;
    const findChunkLocationAt = (beat: number) => {
      let lo = 0;
      let hi = chunkLocations.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (chunkLocations[mid].beat <= beat) lo = mid + 1;
        else hi = mid;
      }
      const index = Math.max(0, lo - 1);
      return chunkLocations[index] ?? null;
    };
    const tick = () => {
      const state = useGameStore.getState();
      const curBeat = state.isPlaying ? playbackTimeRef.current : state.timeline.preciseTime;
      if (curBeat === lastBeat) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastBeat = curBeat;
      const location = findChunkLocationAt(curBeat);
      const lineIdx = location?.line ?? -1;
      const chunkIdx = location?.chunk ?? -1;
      if (lineIdx !== lastLine || chunkIdx !== lastChunk) {
        lastLine = lineIdx;
        lastChunk = chunkIdx;
        setActive({ line: lineIdx, chunk: chunkIdx });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [chunkLocations, expanded]);

  // 用户用 wheel/touch 滚动后停止自动跟随，按下"居中"按钮恢复。
  const [autoScroll, setAutoScroll] = useState(true);
  const pauseAutoScroll = useCallback(() => setAutoScroll(false), []);

  const centerActive = useCallback(() => {
    const el = itemRefs.current[active.line];
    const container = containerRef.current;
    if (!el || !container) return;
    const rowTop = el.offsetTop - container.offsetTop;
    const target =
      el.offsetHeight > container.clientHeight
        ? rowTop
        : rowTop - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [active.line]);

  // 活跃行变化 / 重新启用 autoScroll 时居中。
  useEffect(() => {
    if (autoScroll) centerActive();
  }, [autoScroll, centerActive]);

  if (statements.length === 0) return null;

  return (
    <Card className={classes.card} radius="lg" withBorder>
      <UnstyledButton onClick={() => setExpanded((v) => !v)} w="100%">
        <Group justify="space-between">
          <Group gap="xs">
            <IconListNumbers size={20} />
            <Text size="sm" fw={500}>
              Simai 语句
            </Text>
          </Group>
          <IconChevronDown
            size={16}
            style={{
              transition: "transform 0.2s",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse expanded={expanded}>
        <div className={classes.viewportWrap}>
          <ScrollArea
            h={240}
            viewportRef={containerRef}
            onWheel={pauseAutoScroll}
            onTouchMove={pauseAutoScroll}
            styles={{ viewport: { fontFamily: "monospace", fontSize: 12, lineHeight: 1.55 } }}
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
                  isMarkerOnly={markerFlags[i]}
                  seekTo={seekTo}
                  registerRef={registerRef}
                />
              );
            })}
          </ScrollArea>
          {!autoScroll && (
            <Tooltip label="恢复自动滚动">
              <ActionIcon
                className={classes.autoScrollBtn}
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => setAutoScroll(true)}
              >
                <IconCurrentLocation size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </Collapse>
    </Card>
  );
}

export default SimaiStatementList;
