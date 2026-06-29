import { CSSProperties, useRef, useState } from "react";
import { Group, Pagination, PaginationProps, Text } from "@mantine/core";
import { useIsomorphicEffect, useViewportSize } from "@mantine/hooks";

// 统一分页：尺寸按「是否放得下」实测决定，宽页数放不下降 md，md 放不下降 sm，最后塌缩为居中的「‹ 当前/总数 ›」。
// 用组合式（Pagination.Root + wrap="nowrap" 的 Group）渲染，强制单行——一体化 <Pagination> 内部那个
// Group 默认会折行；离流隐藏副本量同一组合的自然宽度与容器比较，尺寸只在真正放不下时变化（无断点跳变）。
const HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "max-content",
  visibility: "hidden",
  pointerEvents: "none",
};

export function ResponsivePagination({
  total,
  value,
  onChange,
  disabled,
  hideWithOnePage,
  siblings = 1,
  mt,
  mb,
  ...rest
}: PaginationProps) {
  const { width: viewportWidth } = useViewportSize();
  const wrapRef = useRef<HTMLDivElement>(null);
  const widestRef = useRef<HTMLDivElement>(null);
  const wideRef = useRef<HTMLDivElement>(null);
  const mdRef = useRef<HTMLDivElement>(null);
  const smRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"widest" | "wide" | "md" | "sm" | "text">("widest");

  useIsomorphicEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !widestRef.current || !wideRef.current || !mdRef.current || !smRef.current) {
      return;
    }
    const available = Math.ceil(wrap.getBoundingClientRect().width);
    if (!available) return;
    if (widestRef.current.offsetWidth <= available) setMode("widest");
    else if (wideRef.current.offsetWidth <= available) setMode("wide");
    else if (mdRef.current.offsetWidth <= available) setMode("md");
    else if (smRef.current.offsetWidth <= available) setMode("sm");
    else setMode("text");
  }, [viewportWidth, total, value, siblings]);

  if (hideWithOnePage && total <= 1) return null;

  const widestSiblings = Math.max(siblings, 3);
  const wideSiblings = Math.max(siblings, 2);

  const rootProps = (size: "md" | "sm", displaySiblings = siblings) => ({
    total,
    value,
    onChange,
    disabled,
    ...rest,
    size,
    siblings: displaySiblings,
  });

  const renderFull = (size: "md" | "sm", siblings?: number) => (
    <Pagination.Root {...rootProps(size, siblings)}>
      <Group gap={8} wrap="nowrap">
        <Pagination.Previous />
        <Pagination.Items />
        <Pagination.Next />
      </Group>
    </Pagination.Root>
  );

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}
    >
      <div ref={widestRef} style={HIDDEN_STYLE}>
        {renderFull("md", widestSiblings)}
      </div>
      <div ref={wideRef} style={HIDDEN_STYLE}>
        {renderFull("md", wideSiblings)}
      </div>
      <div ref={mdRef} style={HIDDEN_STYLE}>
        {renderFull("md")}
      </div>
      <div ref={smRef} style={HIDDEN_STYLE}>
        {renderFull("sm")}
      </div>
      <Group justify="center" mt={mt} mb={mb}>
        {mode === "text" ? (
          <Pagination.Root {...rootProps("sm")}>
            <Group gap="xs" wrap="nowrap">
              <Pagination.Previous />
              <Text size="sm" c="dimmed">
                {value ?? 1} / {total}
              </Text>
              <Pagination.Next />
            </Group>
          </Pagination.Root>
        ) : (
          renderFull(
            mode === "sm" ? "sm" : "md",
            mode === "widest" ? widestSiblings : mode === "wide" ? wideSiblings : siblings,
          )
        )}
      </Group>
    </div>
  );
}
