import { PageProps } from "./Page.tsx";
import { Tabs } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import classes from "./PageTabs.module.css";

export const PageTabs = (props: PageProps) => {
  const tabIds = useMemo(() => props.tabs?.map((tab) => tab.id) ?? [], [props.tabs]);
  const defaultTab = tabIds[0] ?? null;
  const [activeTab, setActiveTab] = useState<string | null>(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return requestedTab && tabIds.includes(requestedTab) ? requestedTab : defaultTab;
  });

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (activeTab && tabIds.includes(activeTab) && (!requestedTab || requestedTab === activeTab)) {
      return;
    }

    const url = new URL(window.location.href);
    if (defaultTab) {
      url.searchParams.set("tab", defaultTab);
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState(window.history.state, "", url.toString());
    setActiveTab(defaultTab);
  }, [activeTab, defaultTab, tabIds]);

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
      <div className={classes.tabsWrapper}>
        <Tabs.List>
          {props.tabs?.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id}>
              {tab.name}
            </Tabs.Tab>
          ))}
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
