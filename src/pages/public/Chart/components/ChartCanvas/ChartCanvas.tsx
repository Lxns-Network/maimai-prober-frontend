import { useEffect, useRef, useCallback } from 'react';
import { useGameStore, playbackTimeRef } from '../../stores/useGameStore';
import { MainRenderer } from '../../renderers/MainRenderer';
import { useAudio } from '../../hooks/useAudio';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../../utils/constants';
import classes from './ChartCanvas.module.css';
import clsx from 'clsx';

type BpmEvent = { timing: number; bpm: number };

function beatsToMs(beats: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
    return (60000 * beats) / defaultBpm;
  }

  let totalMs = 0;
  let lastBeat = 0;
  let currentBpm = bpmEvents[0].bpm;

  for (const event of bpmEvents) {
    if (event.timing >= beats) break;
    totalMs += (60000 * (event.timing - lastBeat)) / currentBpm;
    lastBeat = event.timing;
    currentBpm = event.bpm;
  }

  totalMs += (60000 * (beats - lastBeat)) / currentBpm;
  return totalMs;
}

function msToBeats(ms: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
    return (ms * defaultBpm) / 60000;
  }

  let remainingMs = ms;
  let totalBeats = 0;
  let lastBeat = 0;
  let currentBpm = bpmEvents[0].bpm;

  for (const event of bpmEvents) {
    const segmentBeats = event.timing - lastBeat;
    const segmentMs = (60000 * segmentBeats) / currentBpm;

    if (remainingMs <= segmentMs) {
      totalBeats += (remainingMs * currentBpm) / 60000;
      return totalBeats;
    }

    remainingMs -= segmentMs;
    totalBeats += segmentBeats;
    lastBeat = event.timing;
    currentBpm = event.bpm;
  }

  totalBeats += (remainingMs * currentBpm) / 60000;
  return totalBeats;
}

export function ChartCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MainRenderer | null>(null);
  
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartMsRef = useRef<number>(0);
  const currentBeatsRef = useRef<number>(0);
  
  const fpsRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);

  const answerSound = useAudio({ autoInit: true });
  const answerSoundRefs = useRef({
    tick: answerSound.tick,
    reset: answerSound.reset,
    setEnabled: answerSound.setEnabled,
    setVolume: answerSound.setVolume,
    setTimingOffset: answerSound.setTimingOffset,
    resume: answerSound.resume,
  });

  // 保持 refs 最新
  useEffect(() => {
    answerSoundRefs.current = {
      tick: answerSound.tick,
      reset: answerSound.reset,
      setEnabled: answerSound.setEnabled,
      setVolume: answerSound.setVolume,
      setTimingOffset: answerSound.setTimingOffset,
      resume: answerSound.resume,
    };
  }, [answerSound]);

  useMusicPlayer();

  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const chartData = useGameStore((s) => s.chartData);
  const totalMeasures = useGameStore((s) => s.timeline.totalMeasures);
  const beatsPerMeasure = useGameStore((s) => s.timeline.beatsPerMeasure);
  const hiSpeed = useGameStore((s) => s.hiSpeed);
  const slideRotation = useGameStore((s) => s.slideRotation);
  const mirrorMode = useGameStore((s) => s.mirrorMode);
  const judgmentLineDesign = useGameStore((s) => s.judgmentLineDesign);
  const pinkSlideStart = useGameStore((s) => s.pinkSlideStart);
  const highlightExNotes = useGameStore((s) => s.highlightExNotes);
  const normalColorBreakSlide = useGameStore((s) => s.normalColorBreakSlide);
  const playbackSpeed = useGameStore((s) => s.playbackSpeed);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const soundVolume = useGameStore((s) => s.soundVolume);
  const soundOffset = useGameStore((s) => s.soundOffset);
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);
  const pause = useGameStore((s) => s.pause);

  const renderFrame = useCallback((beatsOverride?: number) => {
    const renderer = rendererRef.current;
    const chart = useGameStore.getState().chartData;
    const timeline = useGameStore.getState().timeline;
    const playing = useGameStore.getState().isPlaying;
    const sound = useGameStore.getState().soundEnabled;

    if (!renderer) return;

    if (!chart) {
      renderer.clear();
      renderer.renderJudgmentLine();
      return;
    }
    const currentBeats = beatsOverride ?? timeline.preciseTime;
    
    const measure = Math.floor(currentBeats / timeline.beatsPerMeasure);
    const beatInMeasure = currentBeats - measure * timeline.beatsPerMeasure;
    const beat = Math.floor(beatInMeasure) + 1;
    const fraction = beatInMeasure - Math.floor(beatInMeasure);
    
    let divisor = 4;
    if (chart.divisorEvents) {
      for (const event of chart.divisorEvents) {
        if (event.timing <= currentBeats) divisor = event.divisor;
        else break;
      }
    }
    
    renderer.setBeatDisplayInfo(measure, beat, fraction, divisor);
    renderer.clear();
    renderer.renderJudgmentLine();
    renderer.renderNotes(chart.notes, currentBeats, chart.bpmEvents);

    if (sound && playing) {
      const currentMs = beatsToMs(currentBeats, chart.bpmEvents, chart.bpm);
      answerSoundRefs.current.tick(chart.notes, currentMs);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MainRenderer(canvas, chartData?.bpm ?? 120);
    renderer.setIsPlaying(isPlaying);
    rendererRef.current = renderer;

    const state = useGameStore.getState();
    renderer.setHiSpeed(state.hiSpeed);
    renderer.setSlideRotation(state.slideRotation);
    renderer.setMirrorMode(state.mirrorMode);
    renderer.setJudgmentLineDesign(state.judgmentLineDesign);
    renderer.setPinkSlideStart(state.pinkSlideStart);
    renderer.setHighlightExNotes(state.highlightExNotes);
    renderer.setNormalColorBreakSlide(state.normalColorBreakSlide);

    const handleResize = () => {
      renderer.resize();
      renderFrame(playbackTimeRef.current);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMediaQuery.addEventListener('change', handleResize);

    return () => {
      resizeObserver.disconnect();
      dprMediaQuery.removeEventListener('change', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderFrame, chartData?.bpm]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setIsPlaying(isPlaying);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setHiSpeed(hiSpeed);
      renderFrame(playbackTimeRef.current);
    }
  }, [hiSpeed, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSlideRotation(slideRotation);
      renderFrame(playbackTimeRef.current);
    }
  }, [slideRotation, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setMirrorMode(mirrorMode);
      renderFrame(playbackTimeRef.current);
    }
  }, [mirrorMode, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setJudgmentLineDesign(judgmentLineDesign);
      renderFrame(playbackTimeRef.current);
    }
  }, [judgmentLineDesign, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPinkSlideStart(pinkSlideStart);
      renderFrame(playbackTimeRef.current);
    }
  }, [pinkSlideStart, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setHighlightExNotes(highlightExNotes);
      renderFrame(playbackTimeRef.current);
    }
  }, [highlightExNotes, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setNormalColorBreakSlide(normalColorBreakSlide);
      renderFrame(playbackTimeRef.current);
    }
  }, [normalColorBreakSlide, renderFrame]);

  useEffect(() => {
    if (rendererRef.current && chartData) {
      rendererRef.current.setBpm(chartData.bpm);
    }
  }, [chartData]);

  useEffect(() => {
    answerSoundRefs.current.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    answerSoundRefs.current.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    answerSoundRefs.current.setTimingOffset(ANSWER_SOUND_BASE_OFFSET_MS + soundOffset);
  }, [soundOffset]);

  // 保存当前播放速度的 ref，用于在动画循环中获取最新值
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    // 当播放速度变化时，更新起始时间和位置以保持当前播放位置
    if (isPlaying && chartData) {
      const currentBeats = playbackTimeRef.current;
      playbackStartTimeRef.current = performance.now();
      playbackStartMsRef.current = beatsToMs(currentBeats, chartData.bpmEvents, chartData.bpm);
    }
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed, isPlaying, chartData]);

  useEffect(() => {
    if (!isPlaying || !chartData) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    answerSoundRefs.current.resume();

    const currentPreciseTime = useGameStore.getState().timeline.preciseTime;
    playbackStartTimeRef.current = performance.now();
    playbackStartMsRef.current = beatsToMs(currentPreciseTime, chartData.bpmEvents, chartData.bpm);

    // 传入当前时间，避免播放之前已经过去的 note 音效
    answerSoundRefs.current.reset(playbackStartMsRef.current);

    const totalBeats = totalMeasures * beatsPerMeasure;
    const totalDurationMs = beatsToMs(totalBeats, chartData.bpmEvents, chartData.bpm);

    let lastSeekVersion = useGameStore.getState().seekVersion;

    const animate = (timestamp: number) => {
      // FPS 统计
      if (lastFrameTimeRef.current > 0) {
        const delta = timestamp - lastFrameTimeRef.current;
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift();
        }
        const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        fpsRef.current = Math.round(1000 / avgDelta);
        if (rendererRef.current) {
          rendererRef.current.setFps(fpsRef.current);
        }
      }
      lastFrameTimeRef.current = timestamp;

      const storeState = useGameStore.getState();
      if (storeState.seekVersion !== lastSeekVersion) {
        lastSeekVersion = storeState.seekVersion;
        playbackStartTimeRef.current = timestamp;
        playbackStartMsRef.current = beatsToMs(
          storeState.timeline.preciseTime,
          chartData.bpmEvents,
          chartData.bpm
        );
        currentBeatsRef.current = storeState.timeline.preciseTime;
        // 传入当前时间，避免播放之前已经过去的 note 音效
        answerSoundRefs.current.reset(playbackStartMsRef.current);
      }

      // 使用 ref 获取最新的播放速度
      const currentSpeed = playbackSpeedRef.current;
      const elapsed = (timestamp - playbackStartTimeRef.current) * currentSpeed;
      const currentMs = playbackStartMsRef.current + elapsed;

      if (currentMs >= totalDurationMs + 500) {
        setPreciseTime(totalBeats);
        pause();
        return;
      }

      const currentBeats = msToBeats(currentMs, chartData.bpmEvents, chartData.bpm);
      currentBeatsRef.current = currentBeats;
      playbackTimeRef.current = currentBeats;
      
      renderFrame(currentBeats);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, chartData, totalMeasures, beatsPerMeasure, pause, setPreciseTime, renderFrame]);

  // 非播放状态下的预览更新（支持拖动进度条时的实时预览）
  useEffect(() => {
    if (isPlaying) return;

    let previewAnimationFrameId: number | null = null;
    let lastPreviewedTime = -1;

    const updatePreview = () => {
      const currentTime = playbackTimeRef.current;
      // 只有当时间变化时才重新渲染
      if (currentTime !== lastPreviewedTime) {
        lastPreviewedTime = currentTime;
        renderFrame(currentTime);
      }
      previewAnimationFrameId = requestAnimationFrame(updatePreview);
    };

    // 立即渲染当前帧
    renderFrame(playbackTimeRef.current);
    previewAnimationFrameId = requestAnimationFrame(updatePreview);

    return () => {
      if (previewAnimationFrameId) {
        cancelAnimationFrame(previewAnimationFrameId);
      }
    };
  }, [isPlaying, renderFrame]);

  return (
    <div ref={containerRef} className={clsx(classes.container, {
      [classes.fullscreen]: isFullscreen,
    })}>
      <canvas ref={canvasRef} className={clsx(classes.canvas, {
        [classes.fullscreen]: isFullscreen,
      })} />
    </div>
  );
}

export default ChartCanvas;
