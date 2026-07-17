import { FloatingIndicator, SimpleGrid, UnstyledButton } from "@mantine/core";
import classes from "./GameTabs.module.css";
import React, { useState } from "react";

interface GameTabsProps {
  tabs: { id: string; name: string }[];
  activeTab: string;
  onTabChange(tab: string): void;
  style?: React.CSSProperties;
}

export const GameTabs = ({ tabs, activeTab, onTabChange, style }: GameTabsProps) => {
  const [rootRef, setRootRef] = useState<HTMLDivElement | null>(null);
  const [controlsRefs, setControlsRefs] = useState<Record<string, HTMLButtonElement | null>>({});

  const setControlRef = (index: string) => (node: HTMLButtonElement) => {
    controlsRefs[index] = node;
    setControlsRefs(controlsRefs);
  };

  return (
    <SimpleGrid
      className={classes.tabs}
      cols={2}
      spacing={0}
      ref={setRootRef}
      style={style}
      role="tablist"
      aria-label="游戏切换"
    >
      {tabs.map((item, index) => (
        <UnstyledButton
          key={item.id}
          className={classes.tab}
          fz="sm"
          ta="center"
          ref={setControlRef(item.id)}
          onClick={() => onTabChange(item.id)}
          onKeyDown={(event) => {
            let nextIndex: number | null = null;
            if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = tabs.length - 1;
            if (nextIndex === null) return;

            event.preventDefault();
            const nextTab = tabs[nextIndex];
            onTabChange(nextTab.id);
            controlsRefs[nextTab.id]?.focus();
          }}
          role="tab"
          aria-selected={activeTab === item.id}
          tabIndex={activeTab === item.id ? 0 : -1}
          mod={{ active: activeTab === item.id }}
        >
          {item.name}
        </UnstyledButton>
      ))}

      <FloatingIndicator
        target={controlsRefs[activeTab]}
        parent={rootRef}
        className={classes.indicator}
        aria-hidden="true"
      />
    </SimpleGrid>
  );
};
