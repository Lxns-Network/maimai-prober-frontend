import { useEffect, useRef } from "react";
import { useModals } from "@mantine/modals";
import { popOverlay, pushOverlay } from "@/utils/overlayBackStack.ts";

export function ManagedModalsBackGuard() {
  const { modals, closeModal } = useModals();
  const depth = modals.length;

  const modalsRef = useRef(modals);
  modalsRef.current = modals;
  const closeRef = useRef(closeModal);
  closeRef.current = closeModal;

  const idsRef = useRef<number[]>([]);

  useEffect(() => {
    const ids = idsRef.current;
    while (ids.length < depth) {
      const id = pushOverlay(() => {
        const open = modalsRef.current;
        if (open.length > 0) closeRef.current(open[open.length - 1].id, true);
      });
      ids.push(id);
    }
    while (ids.length > depth) {
      popOverlay(ids.pop()!);
    }
  }, [depth]);

  return null;
}
