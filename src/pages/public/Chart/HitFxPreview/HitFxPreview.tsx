import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Kbd,
  Radio,
  ScrollArea,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowLeft, IconPlayerPlay, IconPlayerPause, IconRefresh } from "@tabler/icons-react";
import {
  BASE_APPROACH_TIME_MS,
  COLORS,
  HI_SPEED_CONVERSION_FACTOR,
  HI_SPEED_DEFAULT,
  HIT_EFFECT_COLORS,
  HOLD_RELEASE_EFFECT_DURATION_MS,
  HoldEffectRenderer,
  HoldRenderer,
  MainRenderer,
  NOTE_HIT_EFFECT_DURATION_MS,
  NoteRenderer,
  SlideRenderer,
  TouchHitEffectRenderer,
  TouchRenderer,
  type ButtonPosition,
  type HoldEndNote,
  type HoldStartNote,
  type SlideNote,
  type TapNote,
  type TouchHoldStartNote,
  type TouchNote,
  type TouchPosition,
} from "@lxns-network/maimai-chart-engine";
import classes from "./HitFxPreview.module.css";

/**
 * 覆盖引擎内所有带打击/进场演示的 note 形态。
 * 时序：进场 → 命中（本体消失）→ 特效。
 */
type FxKind =
  | "tap"
  | "tap-each"
  | "break"
  | "ex-tap"
  | "star"
  | "star-spin"
  | "hold"
  | "hold-each"
  | "hold-break"
  | "hold-ex"
  | "slide"
  | "slide-break"
  | "touch"
  | "touch-each"
  | "touch-firework"
  | "touch-hold";

type FxOption = {
  value: FxKind;
  label: string;
  group: string;
  /** 命中后阶段时长（hold 体 / 特效） */
  afterMs: number;
  touchApproach?: boolean;
};

const FX_OPTIONS: FxOption[] = [
  { value: "tap", label: "Tap", group: "按钮", afterMs: NOTE_HIT_EFFECT_DURATION_MS },
  {
    value: "tap-each",
    label: "Tap Each（双押黄）",
    group: "按钮",
    afterMs: NOTE_HIT_EFFECT_DURATION_MS,
  },
  { value: "break", label: "Break", group: "按钮", afterMs: NOTE_HIT_EFFECT_DURATION_MS },
  { value: "ex-tap", label: "EX Tap", group: "按钮", afterMs: NOTE_HIT_EFFECT_DURATION_MS },
  { value: "star", label: "Star ($)", group: "按钮", afterMs: NOTE_HIT_EFFECT_DURATION_MS },
  {
    value: "star-spin",
    label: "Spin Star ($$)",
    group: "按钮",
    afterMs: NOTE_HIT_EFFECT_DURATION_MS,
  },
  { value: "hold", label: "Hold", group: "按钮 Hold", afterMs: 1800 },
  { value: "hold-each", label: "Hold Each", group: "按钮 Hold", afterMs: 1800 },
  { value: "hold-break", label: "Break Hold", group: "按钮 Hold", afterMs: 1800 },
  { value: "hold-ex", label: "EX Hold", group: "按钮 Hold", afterMs: 1800 },
  { value: "slide", label: "Slide 头", group: "Slide", afterMs: NOTE_HIT_EFFECT_DURATION_MS },
  {
    value: "slide-break",
    label: "Break Slide 头",
    group: "Slide",
    afterMs: NOTE_HIT_EFFECT_DURATION_MS,
  },
  {
    value: "touch",
    label: "Touch",
    group: "Touch",
    afterMs: 500,
    touchApproach: true,
  },
  {
    value: "touch-each",
    label: "Touch Each",
    group: "Touch",
    afterMs: 500,
    touchApproach: true,
  },
  {
    value: "touch-firework",
    label: "Touch + 烟花 (f)",
    group: "Touch",
    afterMs: 1100,
    touchApproach: true,
  },
  {
    value: "touch-hold",
    label: "Touch Hold",
    group: "Touch",
    afterMs: 1800,
    touchApproach: true,
  },
];

const TOUCH_POS_OPTIONS: { value: TouchPosition; label: string }[] = [
  { value: "C", label: "C" },
  { value: "A1", label: "A1" },
  { value: "B1", label: "B1" },
  { value: "D1", label: "D1" },
  { value: "E1", label: "E1" },
];

const HI_SPEED = HI_SPEED_DEFAULT * HI_SPEED_CONVERSION_FACTOR;
const STAR_SPIN_RAD_PER_MS = (2 * Math.PI) / 1000;

function approachMsFor(opt: FxOption): number {
  const base = BASE_APPROACH_TIME_MS / HI_SPEED;
  return opt.touchApproach ? base * 0.9 : base;
}

function fxMeta(kind: FxKind): FxOption {
  return FX_OPTIONS.find((o) => o.value === kind) ?? FX_OPTIONS[0];
}

function baseNoteFields(timingMs: number) {
  return {
    timing: 0,
    timingMs,
    measure: 0,
    positionInMeasure: 0,
    scale: 1,
    bpm: 120,
  };
}

function makeTap(
  position: ButtonPosition,
  timingMs: number,
  opts: {
    type?: TapNote["type"];
    isStar?: boolean;
    isSpinningStar?: boolean;
    isEx?: boolean;
  } = {},
): TapNote {
  return {
    type: opts.type ?? "tap",
    position,
    ...baseNoteFields(timingMs),
    isStar: opts.isStar,
    isSpinningStar: opts.isSpinningStar,
    isEx: opts.isEx,
  };
}

function makeHold(
  position: ButtonPosition,
  timingMs: number,
  durationMs: number,
  opts: { each?: boolean; isBreakHold?: boolean; isEx?: boolean } = {},
): { start: HoldStartNote; end: HoldEndNote } {
  const duration = (durationMs * 120) / 60000;
  const start: HoldStartNote = {
    type: opts.each ? "hold-start-simultaneous" : "hold-start",
    position,
    ...baseNoteFields(timingMs),
    duration,
    isHoldStart: true,
    isBreakHold: opts.isBreakHold,
    isEx: opts.isEx,
  };
  const end: HoldEndNote = {
    type: opts.each ? "hold-end-simultaneous" : "hold-end",
    position,
    ...baseNoteFields(timingMs + durationMs),
    holdStartTiming: 0,
    isHoldEnd: true,
    isBreakHold: opts.isBreakHold,
    isEx: opts.isEx,
  };
  return { start, end };
}

function makeSlide(
  position: ButtonPosition,
  timingMs: number,
  opts: { isStartBreak?: boolean; isEx?: boolean } = {},
): SlideNote {
  // 预览只关心星星头进场/命中，路径给最短占位
  const endPos = (((position - 1 + 3) % 8) + 1) as ButtonPosition;
  return {
    type: "slide",
    position,
    ...baseNoteFields(timingMs),
    duration: 1,
    durationMs: 500,
    delayMs: 0,
    slideSegments: [{ type: "-", startPos: position, endPos }],
    isStartBreak: opts.isStartBreak,
    isEx: opts.isEx,
  };
}

function makeTouch(
  position: TouchPosition,
  timingMs: number,
  opts: { hasFirework?: boolean } = {},
): TouchNote {
  return {
    type: "touch",
    position,
    ...baseNoteFields(timingMs),
    hasFirework: opts.hasFirework,
  };
}

function makeTouchHold(
  position: TouchPosition,
  timingMs: number,
  durationMs: number,
): TouchHoldStartNote {
  return {
    type: "touch-hold-start",
    position,
    ...baseNoteFields(timingMs),
    duration: (durationMs * 120) / 60000,
    durationMs,
    isHoldStart: true,
  };
}

function isTouchKind(kind: FxKind): boolean {
  return (
    kind === "touch" || kind === "touch-each" || kind === "touch-firework" || kind === "touch-hold"
  );
}

function needsButton(kind: FxKind): boolean {
  return !isTouchKind(kind);
}

function starColor(isBreak: boolean, isEach: boolean): string {
  if (isBreak) return COLORS.BREAK_ORANGE;
  if (isEach) return COLORS.SLIDE_SIMULTANEOUS;
  return COLORS.SLIDE_CYAN;
}

export function HitFxPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<MainRenderer | null>(null);
  const touchFxRef = useRef<TouchHitEffectRenderer | null>(null);
  const holdFxRef = useRef<HoldEffectRenderer | null>(null);
  const noteFxRef = useRef<NoteRenderer | null>(null);
  const touchNoteRef = useRef<TouchRenderer | null>(null);
  const holdNoteRef = useRef<HoldRenderer | null>(null);
  const slideRef = useRef<SlideRenderer | null>(null);
  const rafRef = useRef(0);

  const [fxKind, setFxKind] = useState<FxKind>("tap");
  const [touchPos, setTouchPos] = useState<TouchPosition>("C");
  const [button, setButton] = useState(1);
  const [loop, setLoop] = useState(true);
  const [loopGapMs, setLoopGapMs] = useState(300);
  const [playing, setPlaying] = useState(true);
  const [scrub, setScrub] = useState(0);
  const scrubRef = useRef(0);
  const playEpochRef = useRef(performance.now());

  const meta = fxMeta(fxKind);
  const approachMs = approachMsFor(meta);
  const afterMs = meta.afterMs;
  const durationMs = approachMs + afterMs;

  const stateRef = useRef({
    fxKind,
    touchPos,
    button,
    playing,
    loop,
    loopGapMs,
    durationMs,
    approachMs,
    afterMs,
  });
  stateRef.current = {
    fxKind,
    touchPos,
    button,
    playing,
    loop,
    loopGapMs,
    durationMs,
    approachMs,
    afterMs,
  };

  const restart = useCallback(() => {
    playEpochRef.current = performance.now();
    scrubRef.current = 0;
    setScrub(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    restart();
  }, [fxKind, touchPos, button, restart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        restart();
      } else if (e.key === "l" || e.key === "L") {
        setLoop((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const main = new MainRenderer(canvas);
    main.setJudgmentLineDesign("simple");
    main.setShowHitEffect(true);
    main.setShowFireworks(true);
    mainRef.current = main;

    const ctx = main.getRenderContext();
    const noteFx = new NoteRenderer(ctx);
    touchFxRef.current = new TouchHitEffectRenderer(ctx);
    holdFxRef.current = new HoldEffectRenderer(ctx);
    noteFxRef.current = noteFx;
    touchNoteRef.current = new TouchRenderer(ctx);
    holdNoteRef.current = new HoldRenderer(ctx);
    slideRef.current = new SlideRenderer(ctx, noteFx);

    const sync = () => {
      main.resize(false);
      const next = main.getRenderContext();
      touchFxRef.current?.updateContext(next);
      holdFxRef.current?.updateContext(next);
      noteFxRef.current?.updateContext(next);
      touchNoteRef.current?.updateContext(next);
      holdNoteRef.current?.updateContext(next);
      slideRef.current?.updateContext(next);
    };
    sync();

    const ro = new ResizeObserver(sync);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      ro.disconnect();
      mainRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let stoppedPlaying = false;

    const frame = (now: number) => {
      if (!alive) return;
      const main = mainRef.current;
      const touchFx = touchFxRef.current;
      const holdFx = holdFxRef.current;
      const noteFx = noteFxRef.current;
      const touchNote = touchNoteRef.current;
      const holdNote = holdNoteRef.current;
      const slide = slideRef.current;
      if (!main || !touchFx || !holdFx || !noteFx || !touchNote || !holdNote || !slide) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const s = stateRef.current;
      const cycle = s.durationMs + (s.loop ? s.loopGapMs : 0);
      let ageMs: number;

      if (s.playing) {
        const elapsed = now - playEpochRef.current;
        if (s.loop && cycle > 0) {
          const mod = elapsed % cycle;
          ageMs = mod > s.durationMs ? s.durationMs : mod;
        } else {
          ageMs = Math.min(s.durationMs, elapsed);
          if (elapsed >= s.durationMs && !stoppedPlaying) {
            stoppedPlaying = true;
            setPlaying(false);
          }
        }
        const t = s.durationMs > 0 ? Math.min(1, ageMs / s.durationMs) : 0;
        if (Math.abs(t - scrubRef.current) > 0.002) {
          scrubRef.current = t;
          setScrub(t);
        }
      } else {
        ageMs = scrubRef.current * s.durationMs;
        stoppedPlaying = false;
      }

      main.renderEmptyStage();

      const context = main.getRenderContext();
      const { centerX, centerY, radius } = context;
      const hitAt = s.approachMs;
      const t = ageMs;
      const color = HIT_EFFECT_COLORS.perfect;
      const btn = Math.min(8, Math.max(1, s.button)) as ButtonPosition;
      const kind = s.fxKind;

      const ringPos = () => {
        const a = -Math.PI / 2 + Math.PI / 8 + (btn - 1) * (Math.PI / 4);
        return {
          x: centerX + Math.cos(a) * radius,
          y: centerY + Math.sin(a) * radius,
        };
      };

      const drawTapHit = (shape: "hexagon" | "star") => {
        if (t < hitAt || t >= hitAt + NOTE_HIT_EFFECT_DURATION_MS) return;
        const p = (t - hitAt) / NOTE_HIT_EFFECT_DURATION_MS;
        const origin = ringPos();
        noteFx.renderTapHitEffect(origin.x, origin.y, btn, COLORS.HIT_EFFECT_GOLD, p, shape);
      };

      // ---------- 按钮 Tap 系 ----------
      if (
        kind === "tap" ||
        kind === "tap-each" ||
        kind === "break" ||
        kind === "ex-tap" ||
        kind === "star" ||
        kind === "star-spin"
      ) {
        const isBreak = kind === "break";
        const isEach = kind === "tap-each";
        const isStar = kind === "star" || kind === "star-spin";
        const isSpin = kind === "star-spin";
        const isEx = kind === "ex-tap";
        const note = makeTap(btn, hitAt, {
          type: isBreak ? "break" : isEach ? "simultaneous" : "tap",
          isStar,
          isSpinningStar: isSpin,
          isEx,
        });
        const pos = noteFx.calculateNotePosition(note, 0, t);
        if (pos.visible && t < hitAt) {
          if (isStar) {
            const size = (radius / 12.5) * pos.scale * 1.15 * 1.25;
            const rot = isSpin ? -t * STAR_SPIN_RAD_PER_MS : 0;
            if (isEx) {
              slide.renderExStarRing(pos.x, pos.y, size, isBreak, isEach, 1);
            }
            slide.drawStar(pos.x, pos.y, size, starColor(isBreak, isEach), rot, isEx);
          } else {
            noteFx.renderTapNote(
              pos.x,
              pos.y,
              pos.scale,
              btn,
              isBreak,
              isEach,
              isEx,
              note.timing,
              1,
            );
          }
        }
        drawTapHit(isBreak || isStar ? "star" : "hexagon");
      }

      // ---------- 按钮 Hold ----------
      if (kind === "hold" || kind === "hold-each" || kind === "hold-break" || kind === "hold-ex") {
        const isEach = kind === "hold-each";
        const isBreakHold = kind === "hold-break";
        const isEx = kind === "hold-ex";
        const holdBodyMs = Math.max(0, s.afterMs - HOLD_RELEASE_EFFECT_DURATION_MS);
        const holdEndAt = hitAt + holdBodyMs;
        const { start, end } = makeHold(btn, hitAt, holdBodyMs, {
          each: isEach,
          isBreakHold,
          isEx,
        });
        const startPos = noteFx.calculateNotePosition(start, 0, t);
        const endPos = noteFx.calculateNotePosition(end, 0, t);
        // hold 头在按住期间仍可见
        if (startPos.visible && t < holdEndAt) {
          const grad: [string, string] = isBreakHold
            ? [COLORS.BREAK_GRADIENT_START, COLORS.BREAK_GRADIENT_END]
            : isEach
              ? [COLORS.SIMULTANEOUS_GRADIENT_START, COLORS.SIMULTANEOUS_GRADIENT_END]
              : [COLORS.TAP_GRADIENT_START, COLORS.TAP_GRADIENT_END];
          holdNote.renderHold(
            startPos,
            endPos,
            btn,
            grad,
            isEx,
            start,
            end,
            t,
            isBreakHold,
            isEach,
            1,
          );
        }
        if (t >= hitAt && t < holdEndAt) {
          const origin = ringPos();
          holdFx.renderPressRippleAt(origin.x, origin.y, hitAt, holdEndAt, t, color);
        } else if (t >= holdEndAt) {
          const origin = ringPos();
          holdFx.renderHoldReleaseAt(origin.x, origin.y, holdEndAt, t, color);
        }
      }

      // ---------- Slide 头 ----------
      if (kind === "slide" || kind === "slide-break") {
        const isBreak = kind === "slide-break";
        const note = makeSlide(btn, hitAt, { isStartBreak: isBreak });
        const pos = slide.calculateSlideStartPosition(note, 0, t);
        if (pos.visible && t < hitAt) {
          const size = (radius / 12.5) * pos.scale * 1.15 * 1.25;
          slide.drawStar(pos.x, pos.y, size, starColor(isBreak, false), 0, false);
        }
        drawTapHit("hexagon");
      }

      // ---------- Touch ----------
      if (kind === "touch" || kind === "touch-each" || kind === "touch-firework") {
        const each = kind === "touch-each";
        const note = makeTouch(s.touchPos, hitAt, { hasFirework: kind === "touch-firework" });
        touchNote.renderTouch(note, 0, t, each);
        if (t >= hitAt) {
          touchFx.renderTouchHitEffects([note], t, (pos) => touchNote.getTouchPosition(pos), color);
        }
        if (kind === "touch-firework" && t >= hitAt) {
          touchNote.renderTouchFireworks([note], t);
        }
      }

      // ---------- Touch Hold ----------
      if (kind === "touch-hold") {
        const holdBodyMs = Math.max(0, s.afterMs - HOLD_RELEASE_EFFECT_DURATION_MS);
        const holdEndAt = hitAt + holdBodyMs;
        const hold = makeTouchHold(s.touchPos, hitAt, holdBodyMs);
        touchNote.renderTouch(hold, 0, t, false);
        if (t >= hitAt && t < holdEndAt) {
          const origin = touchNote.getTouchPosition(s.touchPos);
          holdFx.renderPressRippleAt(origin.x, origin.y, hitAt, holdEndAt, t, color);
        } else if (t >= holdEndAt) {
          const origin = touchNote.getTouchPosition(s.touchPos);
          holdFx.renderHoldReleaseAt(origin.x, origin.y, holdEndAt, t, color);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onScrub = (v: number) => {
    scrubRef.current = v;
    setScrub(v);
    setPlaying(false);
  };

  const phaseApproachPct = durationMs > 0 ? (approachMs / durationMs) * 100 : 50;
  const phaseFxPct = 100 - phaseApproachPct;
  const currentMs = Math.round(scrub * durationMs);
  const phaseLabel =
    currentMs < approachMs
      ? `进场 ${currentMs} / ${Math.round(approachMs)} ms`
      : `打击 ${currentMs - Math.round(approachMs)} / ${Math.round(afterMs)} ms`;
  const chartHref = `/chart${typeof window === "undefined" ? "" : window.location.search}`;

  const groups = useMemo(() => {
    const map = new Map<string, FxOption[]>();
    for (const o of FX_OPTIONS) {
      const list = map.get(o.group) ?? [];
      list.push(o);
      map.set(o.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className={classes.root}>
      <div className={classes.layout}>
        <Card className={classes.stageCard} radius="lg" withBorder padding="md">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm">
              <Tooltip label="返回谱面预览">
                <ActionIcon variant="default" component="a" href={chartHref} aria-label="返回">
                  <IconArrowLeft size={18} />
                </ActionIcon>
              </Tooltip>
              <div>
                <Title order={3}>打击特效预览</Title>
                <Text className={classes.meta}>
                  {meta.label} · {phaseLabel}
                </Text>
              </div>
            </Group>
            <Group gap="xs">
              <Button leftSection={<IconRefresh size={16} />} variant="light" onClick={restart}>
                重播
              </Button>
              <Button
                leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                variant={playing ? "filled" : "default"}
                onClick={() => {
                  if (playing) setPlaying(false);
                  else {
                    playEpochRef.current = performance.now() - scrubRef.current * durationMs;
                    setPlaying(true);
                  }
                }}
              >
                {playing ? "暂停" : "播放"}
              </Button>
            </Group>
          </Group>

          <div ref={wrapRef} className={classes.canvasWrap}>
            <canvas ref={canvasRef} className={classes.canvas} />
          </div>

          <Stack gap={6}>
            <div className={classes.phaseBar}>
              <div className={classes.phaseApproach} style={{ width: `${phaseApproachPct}%` }} />
              <div className={classes.phaseFx} style={{ width: `${phaseFxPct}%` }} />
            </div>
            <Text size="xs" c="dimmed">
              蓝=进场 · 黄=命中后（本体消失 + 特效）
            </Text>
            <Slider
              value={scrub}
              onChange={onScrub}
              min={0}
              max={1}
              step={0.001}
              label={(v) => `${Math.round(v * durationMs)} ms`}
            />
          </Stack>
        </Card>

        <Stack className={classes.sidebar}>
          <Card radius="lg" withBorder padding="md" style={{ flex: 1, minHeight: 0 }}>
            <Stack gap="md" style={{ height: "100%" }}>
              <Text size="sm" fw={600}>
                Note 类型
              </Text>
              <ScrollArea style={{ flex: 1 }} offsetScrollbars type="auto" h={360}>
                <Radio.Group value={fxKind} onChange={(v) => setFxKind(v as FxKind)}>
                  <Stack gap="md">
                    {groups.map(([group, opts]) => (
                      <div key={group}>
                        <Text size="xs" c="dimmed" mb={6} tt="uppercase">
                          {group}
                        </Text>
                        <Stack gap={6}>
                          {opts.map((o) => (
                            <Radio key={o.value} value={o.value} label={o.label} size="sm" />
                          ))}
                        </Stack>
                      </div>
                    ))}
                  </Stack>
                </Radio.Group>
              </ScrollArea>

              {isTouchKind(fxKind) && (
                <div>
                  <Text size="sm" fw={600} mb={6}>
                    Touch 位置
                  </Text>
                  <SegmentedControl
                    fullWidth
                    size="xs"
                    value={touchPos}
                    onChange={(v) => setTouchPos(v as TouchPosition)}
                    data={TOUCH_POS_OPTIONS}
                  />
                </div>
              )}

              {needsButton(fxKind) && (
                <div>
                  <Text size="sm" fw={600} mb={6}>
                    按钮位 {button}
                  </Text>
                  <Slider
                    value={button}
                    onChange={setButton}
                    min={1}
                    max={8}
                    step={1}
                    marks={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))}
                  />
                </div>
              )}

              <Switch
                label="循环播放"
                checked={loop}
                onChange={(e) => setLoop(e.currentTarget.checked)}
              />
              {loop && (
                <div>
                  <Text size="sm" fw={600} mb={6}>
                    循环间隔 {loopGapMs} ms
                  </Text>
                  <Slider value={loopGapMs} onChange={setLoopGapMs} min={0} max={1000} step={50} />
                </div>
              )}
            </Stack>
          </Card>

          <Card radius="lg" withBorder padding="md">
            <Text size="sm" fw={600} mb={6}>
              快捷键
            </Text>
            <div className={classes.hotkeyHint}>
              <div>
                <Kbd>Space</Kbd> 重播
              </div>
              <div>
                <Kbd>L</Kbd> 循环
              </div>
            </div>
            <Text size="xs" c="dimmed" mt="sm">
              /chart/hit-fx · 全 note 打击演示
            </Text>
          </Card>
        </Stack>
      </div>
    </div>
  );
}

export default HitFxPreview;
