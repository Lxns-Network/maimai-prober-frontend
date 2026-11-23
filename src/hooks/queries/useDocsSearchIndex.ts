import { useQuery } from "@tanstack/react-query";
import type docsSearchIndex from "virtual:docs-search-index";
import { queryKeys } from "./queryKeys.ts";

export type DocsSearchIndex = typeof docsSearchIndex;

const emptyDocs: DocsSearchIndex = [];

/** 文档标题索引在构建时生成，首次启用时才加载对应的代码分块。 */
export const useDocsSearchIndex = (enabled: boolean) => {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.docs.searchIndex(),
    queryFn: () => import("virtual:docs-search-index").then((module) => module.default),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return { docs: data ?? emptyDocs, isLoading };
};
