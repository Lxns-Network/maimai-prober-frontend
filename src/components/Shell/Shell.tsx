import { Overlay, rem, ScrollArea, Transition } from "@mantine/core";
import Navbar from "./Navbar/Navbar.tsx";
import Header from "./Header/Header.tsx";
import classes from "../../App.module.css";
import React from "react";
import { NAVBAR_BREAKPOINT } from "../../App.tsx";

interface ShellProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  viewportRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

export default function Shell({ navbarOpened, onNavbarToggle, viewportRef, children }: ShellProps) {
  return (
    <div>
      <Transition mounted={navbarOpened} transition="slide-right" duration={300} timingFunction="ease">
        {(styles) => <Navbar style={styles} onClose={onNavbarToggle} />}
      </Transition>
      <Header navbarOpened={navbarOpened} onNavbarToggle={onNavbarToggle} />
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