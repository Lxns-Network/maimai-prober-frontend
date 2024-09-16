import { PageProps } from "./Page.tsx";
import { Tabs } from "@mantine/core";
import { useState } from "react";
import classes from "./PageTabs.module.css";
import { useSearchParams } from "react-router-dom";

export const PageTabs = (props: PageProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || props.tabs?.[0].id);

  return (
    <Tabs
      variant="outline"
      value={activeTab}
      classNames={{ list: classes.tabsList, tab: classes.tab}}
      keepMounted={false}
      radius="md"
      onChange={(tab) => {
        setSearchParams({ tab: tab! });
        setActiveTab(tab!)
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
          <div className={classes.tabContent}>
            {tab.children}
          </div>
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}