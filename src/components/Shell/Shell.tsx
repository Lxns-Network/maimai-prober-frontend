import { Drawer, ScrollArea } from "@mantine/core";
import Navbar from "./Navbar/Navbar.tsx";
import Header from "./Header/Header.tsx";
import classes from "./Shell.module.css";
import React, { useEffect, useRef, useState } from "react";
import { useScroll } from "react-use";
import { useMediaQuery } from "@mantine/hooks";
import { CreateScoreModalProvider } from "../ModalProvider/CreateScoreModalProvider.tsx";
import { ScoreModalProvider } from "../ModalProvider/ScoreModalProvider.tsx";
import { CreateAliasModalProvider } from "../ModalProvider/CreateAliasModalProvider.tsx";
import { UrgentNotificationModal } from "@/components/Notifications/UrgentNotificationModal.tsx";

export const NAVBAR_BREAKPOINT = 992;

interface ShellProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  viewportRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function Shell({ navbarOpened, onNavbarToggle, viewportRef, children }: ShellProps) {
  const isMobile = useMediaQuery(`(max-width: ${NAVBAR_BREAKPOINT}px)`);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollState = useScroll(viewportRef as React.RefObject<HTMLElement>);

  useEffect(() => {
    const currentScrollTop = scrollState.y;

    if (Math.abs(lastScrollTopRef.current - currentScrollTop) > 50) {
      setScrollDirection(currentScrollTop > lastScrollTopRef.current ? "down" : "up");
      lastScrollTopRef.current = currentScrollTop;
    }
  }, [scrollState.y]);

  useEffect(() => {
    setScrollDirection("up");
  }, [navbarOpened]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeight = () => {
      const currentHeight = header.clientHeight || 56;
      setHeaderHeight((previousHeight) =>
        previousHeight === currentHeight ? previousHeight : currentHeight,
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="shell-root"
      style={
        {
          "--navbar-width": "300px",
          "--header-height": headerHeight ? `${headerHeight}px` : undefined,
        } as React.CSSProperties
      }
    >
      <a className={classes.skipLink} href="#main-content">
        跳到主要内容
      </a>

      {isMobile ? (
        <Drawer
          opened={navbarOpened}
          onClose={onNavbarToggle}
          position="left"
          size="300px"
          title="主导航"
          closeButtonProps={{ "aria-label": "关闭主导航" }}
          styles={{
            content: { display: "flex", flexDirection: "column" },
            body: { flex: 1, minHeight: 0, padding: 0 },
          }}
        >
          <Navbar
            style={{ position: "static", width: "100%", height: "100%", borderRight: 0 }}
            onClose={onNavbarToggle}
          />
        </Drawer>
      ) : (
        <Navbar onClose={onNavbarToggle} />
      )}

      <Header
        navbarOpened={navbarOpened}
        onNavbarToggle={onNavbarToggle}
        gameTabsVisible={!scrollDirection || scrollDirection === "up"}
        headerRef={headerRef}
      />

      <ScrollArea className={classes.routesWrapper} type="scroll" viewportRef={viewportRef}>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </ScrollArea>

      <ScoreModalProvider />
      <CreateScoreModalProvider />
      <CreateAliasModalProvider />
      <UrgentNotificationModal />
    </div>
  );
}
