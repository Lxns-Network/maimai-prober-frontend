import { useEffect, useRef } from "react";
import { popOverlay, pushOverlay } from "@/utils/overlayBackStack.ts";

export function useBackDismiss(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const id = pushOverlay(() => onCloseRef.current());
    return () => popOverlay(id);
  }, [active]);
}
