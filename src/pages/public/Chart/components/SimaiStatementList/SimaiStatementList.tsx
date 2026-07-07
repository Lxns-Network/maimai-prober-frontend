import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

const LEAD_IN_BEATS = 4;

interface SimaiChunk {
  text: string;
  beat: number;
  isEmpty?: boolean;
}
interface SimaiStatement {
  beat: number;
  chunks: SimaiChunk[];
  markerText?: string;
}

function formatMarkerNumber(value: string): string {
  const numberValue = parseFloat(value);
  return Number.isInteger(numberValue) ? String(numberValue) : value;
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
    let chunks: SimaiChunk[] = [];
    let lineStartBeat = beat;
    let buf = "";
    let bufBeat = beat;

    const flush = (includeEmpty = false) => {
      const text = buf.trim();
      if (text || includeEmpty) chunks.push({ text, beat: bufBeat, isEmpty: !text });
      buf = "";
      bufBeat = beat;
    };

    const pushChunks = () => {
      if (chunks.length === 0) return;
      out.push({ beat: lineStartBeat, chunks });
      chunks = [];
      lineStartBeat = beat;
    };

    const pushMarker = (markerText: string) => {
      flush();
      pushChunks();
      out.push({ beat, chunks: [], markerText });
      lineStartBeat = beat;
    };

    let i = 0;
    while (i < content.length) {
      const c = content[i];
      if (c === ",") {
        flush(true);
        beat += 4 / divisor;
        bufBeat = beat;
        i++;
      } else if (c === "(") {
        const m = content.substring(i).match(/^\((\d+(?:\.\d+)?)\)(\{(\d+(?:\.\d+)?)\})?/);
        if (m) {
          const markerParts = [`BPM ${formatMarkerNumber(m[1])}`];
          if (m[3]) {
            divisor = parseFloat(m[3]);
            markerParts.push(`1/${formatMarkerNumber(m[3])}`);
          }
          pushMarker(markerParts.join(" | "));
          i += m[0].length;
        } else {
          buf += c;
          i++;
        }
      } else if (c === "{") {
        const m = content.substring(i).match(/^\{(\d+(?:\.\d+)?)\}/);
        if (m) {
          divisor = parseFloat(m[1]);
          pushMarker(`1/${formatMarkerNumber(m[1])}`);
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
    flush(content.trimEnd().endsWith(","));
    pushChunks();
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
  isActive: boolean;
  activeChunkIdx: number;
  isMarkerRow: boolean;
  seekTo: (beat: number) => void;
}

const StatementRow = memo(function StatementRow({
  statement,
  isActive,
  activeChunkIdx,
  isMarkerRow,
  seekTo,
}: StatementRowProps) {
  const chunksRef = useRef<HTMLSpanElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const prevChunkRef = useRef(-1);

  // 高亮胶囊滑动到活跃 chunk;行刚激活时直接落位,不做跨位置滑动。
  useLayoutEffect(() => {
    const wrap = chunksRef.current;
    const highlight = highlightRef.current;
    if (!wrap || !highlight) return;
    const target =
      isActive && activeChunkIdx >= 0
        ? (wrap.children[activeChunkIdx + 1] as HTMLElement | undefined)
        : undefined;
    if (!target) {
      highlight.style.opacity = "0";
      prevChunkRef.current = -1;
      return;
    }
    const snap = prevChunkRef.current === -1;
    prevChunkRef.current = activeChunkIdx;
    if (snap) highlight.style.transition = "none";
    highlight.style.opacity = "1";
    highlight.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
    highlight.style.width = `${target.offsetWidth}px`;
    highlight.style.height = `${target.offsetHeight}px`;
    if (snap) {
      highlight.getBoundingClientRect();
      highlight.style.transition = "";
    }
  }, [isActive, activeChunkIdx]);

  const rowClass = [classes.row, isActive && classes.rowActive, isMarkerRow && classes.rowMarker]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={rowClass} onClick={() => seekTo(statement.beat)}>
      <span className={classes.beat}>{statement.beat.toFixed(2)}</span>
      {statement.markerText ? (
        <span className={classes.markerText}>{statement.markerText}</span>
      ) : (
        <span ref={chunksRef} className={classes.chunks}>
          <span ref={highlightRef} className={classes.chunkHighlight} />
          {statement.chunks.map((c, ci) => {
            const isActiveChunk = isActive && ci === activeChunkIdx;
            const chunkClass = [
              classes.chunk,
              c.isEmpty && classes.chunkEmpty,
              isActiveChunk && classes.chunkActive,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <span
                key={ci}
                className={chunkClass}
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
      )}
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
  const [everExpanded, setEverExpanded] = useState(false);
  const statements = useMemo(
    () => (everExpanded ? parseSimaiStatements(simaiText, difficulty) : []),
    [everExpanded, simaiText, difficulty],
  );
  const chunkLocations = useMemo(
    () =>
      statements.flatMap((statement, line) =>
        statement.markerText
          ? [{ beat: statement.beat, line, chunk: -1 }]
          : statement.chunks.map((chunk, chunkIndex) => ({
              beat: chunk.beat,
              line,
              chunk: chunkIndex,
            })),
      ),
    [statements],
  );
  const markerFlags = useMemo(() => statements.map((s) => Boolean(s.markerText)), [statements]);
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

  const [expanded, setExpanded] = useState(false);

  // 切换谱面/难度后回到未解析状态,收起时不为新谱面的解析买单。
  useEffect(() => {
    setEverExpanded(false);
    setExpanded(false);
  }, [simaiText, difficulty]);

  const rowVirtualizer = useVirtualizer({
    count: statements.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 19,
    overscan: 12,
  });

  useEffect(() => {
    if (!expanded) {
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

  const [autoScroll, setAutoScroll] = useState(true);
  const pauseAutoScroll = useCallback(() => setAutoScroll(false), []);

  useEffect(() => {
    if (autoScroll && expanded && active.line >= 0) {
      rowVirtualizer.scrollToIndex(active.line, { align: "center" });
    }
  }, [autoScroll, expanded, active.line, rowVirtualizer]);

  if (!simaiText.trim()) return null;

  return (
    <Card className={classes.card} radius="lg" withBorder>
      <UnstyledButton
        onClick={() => {
          setEverExpanded(true);
          setExpanded((v) => !v);
        }}
        w="100%"
      >
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

      <Collapse expanded={expanded} keepMounted={false}>
        <div className={classes.viewportWrap}>
          <ScrollArea
            h={240}
            viewportRef={containerRef}
            onWheel={pauseAutoScroll}
            onTouchMove={pauseAutoScroll}
            styles={{
              viewport: {
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.55,
                paddingRight: 12,
              },
            }}
          >
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const i = virtualRow.index;
                const isActive = i === active.line;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={i}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <StatementRow
                      statement={statements[i]}
                      isActive={isActive}
                      activeChunkIdx={isActive ? active.chunk : -1}
                      isMarkerRow={markerFlags[i]}
                      seekTo={seekTo}
                    />
                  </div>
                );
              })}
            </div>
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
