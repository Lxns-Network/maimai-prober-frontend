import { createContext, type MouseEventHandler, type RefObject, useContext, useRef } from "react";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useOverlayNavigationStore } from "@/hooks/useOverlayNavigationStore";

export const ResumableOverlayContext = createContext<{
  sessionId: string;
  pageViewportRef: RefObject<HTMLDivElement>;
} | null>(null);

export type OverlayLinkProps = {
  "data-vike": "false";
  onClick: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * 仅用于 openOverlay 的 render 子树。弹窗须 keepMounted，并在进入动画完成后调用 restoreView。
 * linkProps 须展开到原生 a 元素，不可与自行调用 navigate 的 Link 组件叠加。
 * @throws {Error} 不在 OverlayNavigationProvider 的会话子树内调用时抛出。
 */
export function useResumableOverlay({
  opened,
  onClose,
  getScrollViewport,
}: {
  opened: boolean;
  onClose: () => void;
  getScrollViewport: () => HTMLElement | null | undefined;
}) {
  const context = useContext(ResumableOverlayContext);
  if (!context) throw new Error("useResumableOverlay requires OverlayNavigationProvider");
  const { sessionId, pageViewportRef } = context;
  const { navigateFromOverlay, detachOverlay } = useBackDismiss(opened, onClose, sessionId);
  const suspendedScrollTop = useRef(0);
  const restoreFocusRef = useRef<HTMLAnchorElement | null>(null);

  const onLinkClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    const link = event.currentTarget;
    if (
      !link.getAttribute("href") ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download") ||
      new URL(link.href).origin !== window.location.origin
    ) {
      return;
    }
    event.preventDefault();
    const { navigating, visitPage } = useOverlayNavigationStore.getState();
    if (navigating) return;
    suspendedScrollTop.current = getScrollViewport()?.scrollTop ?? 0;
    restoreFocusRef.current = link;
    detachOverlay();
    const url = new URL(link.href);
    void visitPage(
      sessionId,
      url.pathname + url.search + url.hash,
      pageViewportRef.current?.scrollTop ?? 0,
    );
  };

  const restoreView = () => {
    const session = useOverlayNavigationStore
      .getState()
      .sessions.find((item) => item.id === sessionId);
    if (!session?.resumed) return;
    getScrollViewport()?.scrollTo({ top: suspendedScrollTop.current, behavior: "instant" });
    restoreFocusRef.current?.focus({ preventScroll: true });
  };

  const linkProps: OverlayLinkProps = { "data-vike": "false", onClick: onLinkClick };
  return { linkProps, restoreView, navigateFromOverlay };
}
