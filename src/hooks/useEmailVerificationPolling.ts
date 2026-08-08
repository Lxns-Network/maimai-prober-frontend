import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL = 5_000;
const POLL_TIMEOUT = 5 * 60_000;

interface EmailVerificationPollingOptions {
  active: boolean;
  verified: boolean;
  invalidate: () => Promise<unknown>;
}

export function useEmailVerificationPolling({
  active,
  verified,
  invalidate,
}: EmailVerificationPollingOptions) {
  const startedAt = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkNow = useCallback(async () => {
    setIsChecking(true);
    try {
      await invalidate();
    } finally {
      setIsChecking(false);
    }
  }, [invalidate]);

  useEffect(() => {
    if (!active || verified) {
      startedAt.current = null;
      if (timedOut) setTimedOut(false);
      return;
    }
    if (timedOut) return;

    const start = startedAt.current ?? Date.now();
    startedAt.current = start;
    const deadline = start + POLL_TIMEOUT;

    const check = () => {
      if (Date.now() >= deadline) {
        setTimedOut(true);
        return;
      }
      if (document.visibilityState === "visible") void invalidate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    const interval = window.setInterval(check, POLL_INTERVAL);
    const timeout = window.setTimeout(() => setTimedOut(true), Math.max(0, deadline - Date.now()));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, invalidate, timedOut, verified]);

  return { checkNow, isChecking, timedOut };
}
