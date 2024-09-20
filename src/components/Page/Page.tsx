import React, { useEffect } from "react";
import { PageTabs } from "./PageTabs.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { PageRawContent } from "./PageRawContent.tsx";
import { NAVBAR_BREAKPOINT } from "@/App.tsx";

export interface PageProps {
  meta: {
    title: string;
    description: string;
  };
  tabs?: {
    id: string;
    name: string;
    children: React.ReactNode;
  }[];
  children?: React.ReactNode;
}

export const Page = (props: PageProps) => {
  useEffect(() => {
    document.title = `${props.meta.title} | maimai DX 查分器`;
  }, []);

  return (
    <div style={{
      "--page-max-width": `calc(${NAVBAR_BREAKPOINT}px - var(--navbar-width))`,
    } as React.CSSProperties}>
      <PageHeader {...props} />

      {props.tabs && (
        <PageTabs {...props} />
      )}

      {props.children && (
        <PageRawContent {...props} />
      )}
    </div>
  );
}