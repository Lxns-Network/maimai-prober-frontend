import { CSSProperties, useRef, useState } from "react";
import { Group, Pagination, PaginationProps, Text } from "@mantine/core";
import { useIsomorphicEffect, useViewportSize } from "@mantine/hooks";

// 统一分页：尺寸按「是否放得下」实测决定，md 放不下降 sm、sm 仍放不下塌缩为居中的「‹ 当前/总数 ›」。
// 离流隐藏副本量 md/sm 的自然宽度与容器比较；容器须 overflow:hidden + minWidth:0 才能缩到可用宽度。
// 这样尺寸只在真正放不下时才变化（由实测触发，而非固定断点），避免断点处的尺寸跳变。
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
  mt,
  mb,
  ...rest
}: PaginationProps) {
  const { width: viewportWidth } = useViewportSize();
  const wrapRef = useRef<HTMLDivElement>(null);
  const mdRef = useRef<HTMLDivElement>(null);
  const smRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"md" | "sm" | "text">("md");

  useIsomorphicEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !mdRef.current || !smRef.current) return;
    const available = Math.ceil(wrap.getBoundingClientRect().width);
    if (!available) return;
    if (mdRef.current.offsetWidth <= available) setMode("md");
    else if (smRef.current.offsetWidth <= available) setMode("sm");
    else setMode("text");
  }, [viewportWidth, total, value]);

  if (hideWithOnePage && total <= 1) return null;

  const props = (size: "md" | "sm") => ({ total, value, onChange, disabled, ...rest, size });

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}
    >
      <div ref={mdRef} style={HIDDEN_STYLE}>
        <Pagination {...props("md")} />
      </div>
      <div ref={smRef} style={HIDDEN_STYLE}>
        <Pagination {...props("sm")} />
      </div>
      <Group justify="center" mt={mt} mb={mb}>
        {mode === "text" ? (
          <Pagination.Root {...props("sm")}>
            <Group gap="xs">
              <Pagination.Previous />
              <Text size="sm" c="dimmed">
                {value ?? 1} / {total}
              </Text>
              <Pagination.Next />
            </Group>
          </Pagination.Root>
        ) : (
          <Pagination {...props(mode)} />
        )}
      </Group>
    </div>
  );
}
