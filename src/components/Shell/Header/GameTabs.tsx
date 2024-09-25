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
    <SimpleGrid className={classes.tabs} cols={2} spacing={0} ref={setRootRef} style={style}>
      {tabs.map((item) => (
        <UnstyledButton
          key={item.id}
          className={classes.tab}
          fz="sm"
          ta="center"
          ref={setControlRef(item.id)}
          onClick={() => onTabChange(item.id)}
          mod={{ active: activeTab === item.id }}
        >
          {item.name}
        </UnstyledButton>
      ))}

      <FloatingIndicator
        target={controlsRefs[activeTab]}
        parent={rootRef}
        className={classes.indicator}
      />
    </SimpleGrid>
  );
}