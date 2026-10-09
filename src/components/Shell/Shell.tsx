import { Overlay, ScrollArea, Transition } from "@mantine/core";
import Navbar from "./Navbar/Navbar.tsx";
import Header from "./Header/Header.tsx";
import classes from "./Shell.module.css";
import React, { useEffect, useRef, useState } from "react";
import { useScroll, useWindowSize } from "react-use";
import { CreateScoreModalProvider } from "../ModalProvider/CreateScoreModalProvider.tsx";
import { ScoreModalProvider } from "../ModalProvider/ScoreModalProvider.tsx";
import { CreateAliasModalProvider } from "../ModalProvider/CreateAliasModalProvider.tsx";
import { UrgentNotificationModal } from "@/components/Notifications/UrgentNotificationModal.tsx";
import { VersionPill } from "./VersionPill/VersionPill.tsx";
import { usePageContext } from "vike-react/usePageContext";
import { ShellViewportProvider, type ShellViewportRef } from "./ShellViewportContext.ts";

export const NAVBAR_BREAKPOINT = 992;

const popCenter = {
  in: { opacity: 1, transform: "scale(1)" },
  out: { opacity: 0, transform: "scale(0.8)" },
  common: { transformOrigin: "center center" },
  transitionProperty: "transform, opacity",
};

interface ShellProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  viewportRef: ShellViewportRef;
  children: React.ReactNode;
}

export default function Shell({ navbarOpened, onNavbarToggle, viewportRef, children }: ShellProps) {
  const { width } = useWindowSize();

  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null);
  const lastScrollTop = useRef(0);
  const scrollState = useScroll(viewportRef as React.RefObject<HTMLElement>);

  useEffect(() => {
    const currentScrollTop = scrollState.y;

    if (Math.abs(lastScrollTop.current - currentScrollTop) > 50) {
      setScrollDirection(currentScrollTop > lastScrollTop.current ? "down" : "up");
      lastScrollTop.current = currentScrollTop;
    }
  }, [scrollState.y]);

  const chromeVisible = !scrollDirection || scrollDirection === "up";
  const mobileNavbarOpened = navbarOpened && width <= NAVBAR_BREAKPOINT;
  const isHome = usePageContext().urlPathname === "/";

  return (
    <ShellViewportProvider value={viewportRef}>
      <div
        id="shell-root"
        style={
          {
            "--navbar-width": "300px",
          } as React.CSSProperties
        }
      >
        <Transition
          mounted={navbarOpened}
          transition="slide-right"
          duration={300}
          timingFunction="ease"
        >
          {(styles) => <Navbar style={styles} onClose={onNavbarToggle} />}
        </Transition>

        <Header
          navbarOpened={navbarOpened}
          onNavbarToggle={onNavbarToggle}
          gameTabsVisible={chromeVisible || mobileNavbarOpened}
        />

        <ScrollArea
          className={classes.routesWrapper}
          classNames={{ viewport: classes.viewport }}
          type="scroll"
          viewportRef={viewportRef}
        >
          <Transition
            mounted={mobileNavbarOpened}
            transition="fade"
            duration={300}
            timingFunction="ease"
          >
            {(styles) => (
              <Overlay color="#000" style={styles} onClick={onNavbarToggle} zIndex={100} />
            )}
          </Transition>
          {children}
        </ScrollArea>

        <ScoreModalProvider />
        <CreateScoreModalProvider />
        <CreateAliasModalProvider />
        <UrgentNotificationModal />

        <Transition
          mounted={isHome && chromeVisible}
          transition={popCenter}
          duration={300}
          timingFunction="ease"
        >
          {(styles) => <VersionPill style={styles} />}
        </Transition>
      </div>
    </ShellViewportProvider>
  );
}
