import React from "react";
import { PageTabs } from "./PageTabs.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { PageRawContent } from "./PageRawContent.tsx";
import { NAVBAR_BREAKPOINT } from "@/App.tsx";
import { Helmet } from "react-helmet";

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
  return (
    <div style={{
      "--page-max-width": `calc(${NAVBAR_BREAKPOINT}px - var(--navbar-width))`,
    } as React.CSSProperties}>
      <Helmet
        defaultTitle="maimai DX 查分器"
        titleTemplate="%s | maimai DX 查分器"
      >
        {props.meta.title && <title>{props.meta.title}</title>}
        {props.meta.description && <meta name="description" content={props.meta.description} />}
      </Helmet>

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