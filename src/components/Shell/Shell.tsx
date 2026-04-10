import { Overlay, ScrollArea, Transition } from "@mantine/core";
import Navbar from "./Navbar/Navbar.tsx";
import Header from "./Header/Header.tsx";
import classes from "./Shell.module.css";
import React, { useEffect, useRef, useState } from "react";
import { useScroll, useWindowSize } from "react-use";
import { CreateScoreModalProvider } from "../ModalProvider/CreateScoreModalProvider.tsx";
import { ScoreModalProvider } from "../ModalProvider/ScoreModalProvider.tsx";
import { CreateAliasModalProvider } from "../ModalProvider/CreateAliasModalProvider.tsx";

export const NAVBAR_BREAKPOINT = 992;

interface ShellProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  viewportRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function Shell({ navbarOpened, onNavbarToggle, viewportRef, children }: ShellProps) {
  const { width } = useWindowSize();
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const scrollState = useScroll(viewportRef as React.RefObject<HTMLElement>);

  useEffect(() => {
    const currentScrollTop = scrollState.y;

    if (Math.abs(lastScrollTop - currentScrollTop) > 50) {
      setScrollDirection(currentScrollTop > lastScrollTop ? 'down' : 'up');
      setLastScrollTop(currentScrollTop);
    }
  }, [scrollState.y]);

  useEffect(() => {
    setScrollDirection('up');
  }, [navbarOpened]);

  useEffect(() => {
    if (!scrollDirection) return;

    let frameRequest = 0;
    let start: number | undefined = undefined;

    const updateHeight = (timestamp: number) => {
      if (start === undefined) start = timestamp;
      const elapsed = timestamp - start;

      const currentHeight = headerRef.current?.clientHeight || 56;
      setHeaderHeight((prevHeight) => (prevHeight !== currentHeight ? currentHeight : prevHeight));

      if (elapsed < 300) {
        frameRequest = requestAnimationFrame(updateHeight);
      }
    };

    frameRequest = requestAnimationFrame(updateHeight);

    return () => {
      if (frameRequest) cancelAnimationFrame(frameRequest);
    };
  }, [scrollDirection]);

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.clientHeight);
    }
  }, [headerRef.current, width]);

  return (
    <div id="shell-root" style={{
      "--navbar-width": "300px",
      "--header-height": headerHeight ? `${headerHeight}px` : undefined,
    } as React.CSSProperties}>
      <Transition mounted={navbarOpened} transition="slide-right" duration={300} timingFunction="ease">
        {(styles) => <Navbar style={styles} onClose={onNavbarToggle} />}
      </Transition>

      <Header
        navbarOpened={navbarOpened}
        onNavbarToggle={onNavbarToggle}
        gameTabsVisible={!scrollDirection || scrollDirection === 'up'}
        headerRef={headerRef}
      />

      <ScrollArea className={classes.routesWrapper} type="scroll" viewportRef={viewportRef}>
        <Transition mounted={navbarOpened && width <= NAVBAR_BREAKPOINT} transition="fade" duration={300} timingFunction="ease">
          {(styles) => <Overlay color="#000" style={styles} onClick={onNavbarToggle} zIndex={100} />}
        </Transition>
        {children}
      </ScrollArea>

      <ScoreModalProvider />
      <CreateScoreModalProvider />
      <CreateAliasModalProvider />
    </div>
  );
}
