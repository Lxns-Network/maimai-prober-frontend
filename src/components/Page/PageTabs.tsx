import { PageProps } from "./Page.tsx";
import { Scroller, Tabs } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import classes from "./PageTabs.module.css";
import { usePageContext } from "vike-react/usePageContext";

export const PageTabs = (props: PageProps) => {
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || props.tabs?.[0].id);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    wrapperRef.current
      ?.querySelector<HTMLElement>('[role="tab"][data-active]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  return (
    <Tabs
      variant="outline"
      value={activeTab}
      classNames={{ list: classes.tabsList, tab: classes.tab }}
      keepMounted={false}
      radius="md"
      onChange={(tab) => {
        if (!tab) return;
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.replaceState(window.history.state, "", url.toString());
        setActiveTab(tab);
      }}
    >
      <div ref={wrapperRef} className={classes.tabsWrapper}>
        <Tabs.List>
          <Scroller
            classNames={{ control: classes.scrollerControl }}
            edgeGradientColor="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))"
          >
            {props.tabs?.map((tab) => (
              <Tabs.Tab key={tab.id} value={tab.id}>
                {tab.name}
              </Tabs.Tab>
            ))}
          </Scroller>
        </Tabs.List>
      </div>

      {props.tabs?.map((tab) => (
        <Tabs.Panel key={tab.id} value={tab.id}>
          <div className={classes.tabContent}>{tab.children}</div>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
};
