import { type RefObject, useEffect } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { useOverlayNavigationStore } from "@/hooks/useOverlayNavigationStore";
import { ResumableOverlayContext } from "@/hooks/useResumableOverlay";

export function OverlayNavigationProvider({
  viewportRef,
}: {
  viewportRef: RefObject<HTMLDivElement>;
}) {
  const sessions = useOverlayNavigationStore((state) => state.sessions);
  const syncHistory = useOverlayNavigationStore((state) => state.syncHistory);
  const { urlPathname, urlOriginal } = usePageContext();
  const resumedSession = sessions.find((session) => session.opened && session.resumed);
  const resumedId = resumedSession?.id;
  const sourceScrollTop = resumedSession?.sourceScrollTop;

  useEffect(() => {
    const onPopState = () => queueMicrotask(syncHistory);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [syncHistory]);

  useEffect(() => {
    syncHistory();
  }, [urlOriginal, syncHistory]);

  useEffect(() => {
    if (
      useOverlayNavigationStore
        .getState()
        .sessions.some((session) => session.opened && session.resumed)
    )
      return;
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [urlPathname, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!resumedId || sourceScrollTop === undefined || !viewport) return;
    const restoreScroll = () => {
      viewport.scrollTo({ top: sourceScrollTop, behavior: "instant" });
      if (viewport.scrollHeight - viewport.clientHeight >= sourceScrollTop) observer.disconnect();
    };
    const observer = new ResizeObserver(restoreScroll);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    const frame = requestAnimationFrame(restoreScroll);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [urlPathname, resumedId, sourceScrollTop, viewportRef]);

  return sessions.map((session) => (
    <ResumableOverlayContext.Provider
      key={session.id}
      value={{ sessionId: session.id, pageViewportRef: viewportRef }}
    >
      {session.render(session.opened)}
    </ResumableOverlayContext.Provider>
  ));
}
