import { type ReactNode } from "react";
import { create } from "zustand";
import { navigate } from "vike/client/router";
import { notifications } from "@mantine/notifications";
import { suppressTopOverlayHistoryRestore } from "@/utils/overlayBackStack";

type OverlaySession = {
  id: string;
  opened: boolean;
  render: (opened: boolean) => ReactNode;
  returnLabel: string;
  sourceUrl: string;
  destinationPath?: string;
  sourceScrollTop: number;
  resumed: boolean;
};

type OpenOverlayOptions<Result> = {
  returnLabel: string;
  render: (controls: { opened: boolean; onClose: (result?: Result) => void }) => ReactNode;
  onClose?: (result?: Result) => void;
};

type OverlayNavigationState = {
  sessions: OverlaySession[];
  returnLabel: string | null;
  navigating: boolean;
  openOverlay: <Result>(options: OpenOverlayOptions<Result>) => void;
  visitPage: (id: string, url: string, sourceScrollTop: number) => Promise<void>;
  syncHistory: () => void;
};

function currentUrl() {
  return window.location.pathname + window.location.search + window.location.hash;
}

/** 会话仅驻留内存，由 OverlayNavigationProvider 渲染；业务数据由 render 闭包持有。 */
export const useOverlayNavigationStore = create<OverlayNavigationState>((set, get) => ({
  sessions: [],
  returnLabel: null,
  navigating: false,

  openOverlay: ({ render, returnLabel, onClose }) => {
    const id = crypto.randomUUID();
    const close: typeof onClose = (result) => {
      const session = get().sessions.find((item) => item.id === id);
      if (!session?.opened) return;
      const returningToDestination =
        session.destinationPath === window.location.pathname &&
        window.history.state?.__overlayReturnId === id;
      set(({ sessions }) => ({
        sessions: sessions.map((item) =>
          item.id === id
            ? {
                ...item,
                opened: false,
                destinationPath: returningToDestination ? item.destinationPath : undefined,
              }
            : item,
        ),
      }));
      if (!returningToDestination) onClose?.(result);
    };
    set(({ sessions }) => ({
      sessions: [
        ...sessions.filter((session) => session.destinationPath),
        {
          id,
          opened: true,
          render: (opened) => render({ opened, onClose: close }),
          returnLabel,
          sourceUrl: currentUrl(),
          sourceScrollTop: 0,
          resumed: false,
        },
      ],
    }));
  },

  /** 调用方须先 detachOverlay；保留源弹窗历史项，目标页面另建历史项。 */
  visitPage: async (id, url, sourceScrollTop) => {
    if (get().navigating || !get().sessions.some((session) => session.id === id)) return;
    const sourceUrl = currentUrl();
    const destinationPath = new URL(url, window.location.origin).pathname;
    window.history.replaceState({ ...window.history.state, __overlayKey: id }, "");
    set(({ sessions }) => ({
      navigating: true,
      sessions: sessions.map((session) =>
        session.id === id
          ? { ...session, opened: false, sourceUrl, sourceScrollTop, destinationPath }
          : session,
      ),
    }));
    try {
      await navigate(url);
      if (window.location.pathname === destinationPath) {
        window.history.replaceState({ ...window.history.state, __overlayReturnId: id }, "");
      }
    } catch {
      notifications.show({ title: "无法打开页面", message: "请稍后重试", color: "red" });
    } finally {
      set({ navigating: false });
      get().syncHistory();
    }
  },

  syncHistory: () => {
    const { sessions, navigating } = get();
    if (navigating) return;
    const state = window.history.state;
    const modalIndex = sessions.findIndex(
      (session) => session.id === state?.__overlayKey && session.sourceUrl === currentUrl(),
    );
    const destinationIndex = sessions.findIndex(
      (session) =>
        session.id === state?.__overlayReturnId &&
        session.destinationPath === window.location.pathname,
    );
    if (modalIndex >= 0) {
      set({
        sessions: sessions.slice(0, modalIndex + 1).map((session, index) => ({
          ...session,
          opened: index === modalIndex,
          resumed: index === modalIndex,
        })),
        returnLabel: destinationIndex >= 0 ? sessions[destinationIndex].returnLabel : null,
      });
    } else if (destinationIndex >= 0) {
      if (sessions.some((session) => session.opened)) suppressTopOverlayHistoryRestore();
      set({
        sessions: sessions.map((session) => ({ ...session, opened: false })),
        returnLabel: sessions[destinationIndex].returnLabel,
      });
    } else if (!sessions.some((session) => session.opened && session.sourceUrl === currentUrl())) {
      if (sessions.some((session) => session.opened)) suppressTopOverlayHistoryRestore();
      set({ sessions: [], returnLabel: null });
    }
  },
}));
