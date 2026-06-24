import { useCallback, useEffect, useRef } from "react";
import {
  popOverlay,
  pushOverlay,
  suppressOverlayHistoryRestore,
} from "@/utils/overlayBackStack.ts";
import { navigateReplacingOverlay } from "@/utils/overlayNavigation.ts";

type NavigateOptions = Parameters<typeof navigateReplacingOverlay>[1];

export function useBackDismiss(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const overlayIdRef = useRef<number | null>(null);
  onCloseRef.current = onClose;

  const closeForNavigation = useCallback(() => {
    const id = overlayIdRef.current;
    if (id !== null) suppressOverlayHistoryRestore(id);
    onCloseRef.current();
  }, []);

  const navigateFromOverlay = useCallback(
    (url: string, options?: NavigateOptions) => {
      closeForNavigation();
      navigateReplacingOverlay(url, options);
    },
    [closeForNavigation],
  );

  useEffect(() => {
    if (!active) return;
    const id = pushOverlay(() => onCloseRef.current());
    overlayIdRef.current = id;
    return () => {
      if (overlayIdRef.current === id) overlayIdRef.current = null;
      popOverlay(id);
    };
  }, [active]);

  return { navigateFromOverlay };
}
