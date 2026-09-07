import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { MainRenderer } from "@lxns-network/maimai-chart-engine";
import type { FrameProfileDetail, SubscribeFrameProfile } from "../../../bench/playbackProfile";
import { CHART_BENCH_ENABLED } from "../../../bench/benchEnabled";

const noop = () => {};

const disabledProfiling: ReturnType<typeof useEnabledChartProfiling> = {
  setOverlayProfiling: noop,
  subscribeFrameProfile: () => noop,
  reportFrameProfile: noop,
  syncRendererProfiling: noop,
};

/** 面板与播放录制共享 renderer 计时；每帧快照仅交给正在录制的消费者。 */
function useEnabledChartProfiling(rendererRef: RefObject<MainRenderer | null>) {
  const overlayEnabledRef = useRef(false);
  const subscribersRef = useRef(new Set<(profile: FrameProfileDetail) => void>());
  const syncRendererProfiling = useCallback(() => {
    rendererRef.current?.setProfilingEnabled(
      overlayEnabledRef.current || subscribersRef.current.size > 0,
    );
  }, [rendererRef]);

  const setOverlayProfiling = useCallback(
    (enabled: boolean) => {
      overlayEnabledRef.current = enabled;
      syncRendererProfiling();
    },
    [syncRendererProfiling],
  );

  const subscribeFrameProfile = useCallback<SubscribeFrameProfile>(
    (onFrame) => {
      const subscribers = subscribersRef.current;
      subscribers.add(onFrame);
      syncRendererProfiling();
      return () => {
        subscribers.delete(onFrame);
        syncRendererProfiling();
      };
    },
    [syncRendererProfiling],
  );

  const reportFrameProfile = useCallback((renderer: MainRenderer) => {
    const subscribers = subscribersRef.current;
    if (subscribers.size === 0) return;
    const profile = renderer.getLastFrameProfile();
    if (profile) for (const onFrame of subscribers) onFrame(profile);
  }, []);

  useEffect(() => {
    const subscribers = subscribersRef.current;
    return () => subscribers.clear();
  }, []);

  return { setOverlayProfiling, subscribeFrameProfile, reportFrameProfile, syncRendererProfiling };
}

export const useChartProfiling = CHART_BENCH_ENABLED
  ? useEnabledChartProfiling
  : () => disabledProfiling;
