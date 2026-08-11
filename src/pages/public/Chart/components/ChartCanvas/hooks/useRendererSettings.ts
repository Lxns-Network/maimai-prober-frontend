import { useCallback, useEffect, type RefObject } from "react";
import type { MainRenderer } from "@lxns-network/maimai-chart-engine";
import { playbackTimeRef, useGameStore } from "../../../stores/useGameStore";
import { FULLSCREEN_QUALITY_MP, useGameSettingsStore } from "../../../stores/useGameSettingsStore";

interface UseRendererSettingsOptions {
  rendererRef: RefObject<MainRenderer | null>;
  isFullscreen: boolean;
  renderFrame: (beatsOverride?: number) => void;
  updateCanvasDebugInfo: (force?: boolean) => void;
}

export function applyCurrentRendererSettings(renderer: MainRenderer): void {
  const settingsState = useGameSettingsStore.getState();

  renderer.setFullscreenMaxPixels(FULLSCREEN_QUALITY_MP[settingsState.fullscreenQuality]);
  renderer.setHiSpeed(settingsState.hiSpeed);
  renderer.setAlwaysKeepHiSpeed(settingsState.alwaysKeepHiSpeed);
  renderer.setSlideRotation(settingsState.slideRotation);
  renderer.setMirrorMode(settingsState.mirrorMode);
  renderer.setJudgmentLineDesign(settingsState.judgmentLineDesign);
  renderer.setPinkSlideStart(settingsState.pinkSlideStart);
  renderer.setHighlightExNotes(settingsState.highlightExNotes);
  renderer.setNormalColorBreakSlide(settingsState.normalColorBreakSlide);
  renderer.setShowFireworks(settingsState.showFireworks);
  renderer.setShowHitEffect(settingsState.showHitEffect);
  renderer.setVideoBrightness(settingsState.videoBrightness);
  renderer.setPlaybackSpeed(useGameStore.getState().playbackSpeed);
}

export function useRendererSettings({
  rendererRef,
  isFullscreen,
  renderFrame,
  updateCanvasDebugInfo,
}: UseRendererSettingsOptions): void {
  const playbackSpeed = useGameStore((s) => s.playbackSpeed);
  const fullscreenQuality = useGameSettingsStore((s) => s.fullscreenQuality);
  const hiSpeed = useGameSettingsStore((s) => s.hiSpeed);
  const alwaysKeepHiSpeed = useGameSettingsStore((s) => s.alwaysKeepHiSpeed);
  const slideRotation = useGameSettingsStore((s) => s.slideRotation);
  const mirrorMode = useGameSettingsStore((s) => s.mirrorMode);
  const judgmentLineDesign = useGameSettingsStore((s) => s.judgmentLineDesign);
  const pinkSlideStart = useGameSettingsStore((s) => s.pinkSlideStart);
  const highlightExNotes = useGameSettingsStore((s) => s.highlightExNotes);
  const normalColorBreakSlide = useGameSettingsStore((s) => s.normalColorBreakSlide);
  const showFireworks = useGameSettingsStore((s) => s.showFireworks);
  const showHitEffect = useGameSettingsStore((s) => s.showHitEffect);
  const videoBrightness = useGameSettingsStore((s) => s.videoBrightness);

  const renderCurrentFrame = useCallback(() => {
    renderFrame(playbackTimeRef.current);
  }, [renderFrame]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.setFullscreenMaxPixels(FULLSCREEN_QUALITY_MP[fullscreenQuality]);
    renderer.resize(isFullscreen);
    updateCanvasDebugInfo(true);
    renderCurrentFrame();
  }, [rendererRef, isFullscreen, fullscreenQuality, renderCurrentFrame, updateCanvasDebugInfo]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    applyCurrentRendererSettings(renderer);
    renderCurrentFrame();
  }, [
    rendererRef,
    hiSpeed,
    alwaysKeepHiSpeed,
    playbackSpeed,
    slideRotation,
    mirrorMode,
    judgmentLineDesign,
    pinkSlideStart,
    highlightExNotes,
    normalColorBreakSlide,
    showFireworks,
    showHitEffect,
    videoBrightness,
    renderCurrentFrame,
  ]);
}
