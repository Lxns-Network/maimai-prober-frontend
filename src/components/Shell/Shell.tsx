import { Overlay, rem, ScrollArea, Transition } from "@mantine/core";
import Navbar from "./Navbar/Navbar.tsx";
import Header from "./Header/Header.tsx";
import classes from "../../App.module.css";
import React, { useEffect, useRef, useState } from "react";
import { NAVBAR_BREAKPOINT } from "../../App.tsx";
import { useScroll, useWindowSize } from "react-use";

interface ShellProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  viewportRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function Shell({ navbarOpened, onNavbarToggle, viewportRef, children }: ShellProps) {
  const { width } = useWindowSize();
  const [headerHeight, setHeaderHeight] = useState(56);
  const headerRef = useRef<HTMLDivElement>(null);

  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const scrollState = useScroll(viewportRef);

  useEffect(() => {
    const currentScrollTop = scrollState.y;

    if (currentScrollTop > lastScrollTop) {
      setScrollDirection('down');
    } else if (currentScrollTop < lastScrollTop) {
      setScrollDirection('up');
    }

    setLastScrollTop(currentScrollTop);
  }, [scrollState.y, lastScrollTop]);

  useEffect(() => {
    setScrollDirection('up');
  }, [navbarOpened]);

  useEffect(() => {
    if (!scrollDirection) return;

    let start = 0;
    let frameRequest = 0;

    const updateHeight = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;

      setHeaderHeight(headerRef.current?.clientHeight || 56);

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
    <div style={{
      "--navbar-width": "300px",
      "--header-height": `${headerHeight}px`,
    } as React.CSSProperties}>
      <Transition mounted={navbarOpened} transition="slide-right" duration={300} timingFunction="ease">
        {(styles) => <Navbar style={styles} onClose={onNavbarToggle} />}
      </Transition>
      <Header
        navbarOpened={navbarOpened}
        onNavbarToggle={onNavbarToggle}
        gameTabVisible={!scrollDirection || scrollDirection === 'up'}
        headerRef={headerRef}
      />
      <ScrollArea className={classes.routesWrapper} style={{
        paddingLeft: window.innerWidth > NAVBAR_BREAKPOINT ? rem(300) : 0,
      }} type="scroll" viewportRef={viewportRef}>
        <Transition mounted={navbarOpened && window.innerWidth <= NAVBAR_BREAKPOINT} transition="fade" duration={300} timingFunction="ease">
          {(styles) => <Overlay color="#000" style={styles} onClick={onNavbarToggle} zIndex={100} />}
        </Transition>
        {children}
      </ScrollArea>
    </div>
  );
}