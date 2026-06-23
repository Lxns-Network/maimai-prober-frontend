import { useCallback, useEffect, useRef } from "react";

export function useWakeLock(isPlaying: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!wakeLock) {
      return;
    }

    try {
      await wakeLock.release();
    } catch {
      // 浏览器/系统可能已经释放 wake lock。
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!isPlaying || wakeLockRef.current) {
      return;
    }

    const wakeLockApi = navigator.wakeLock;
    if (!wakeLockApi) {
      return;
    }

    try {
      const wakeLock = await wakeLockApi.request("screen");
      wakeLockRef.current = wakeLock;
      wakeLock.addEventListener?.("release", () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null;
        }
      });
    } catch {
      // 浏览器/系统可能拒绝 wake lock，预览继续工作即可。
    }
  }, [isPlaying]);

  useEffect(() => {
    const sync = () => {
      if (isPlaying && document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      void releaseWakeLock();
    };
  }, [isPlaying, requestWakeLock, releaseWakeLock]);
}
