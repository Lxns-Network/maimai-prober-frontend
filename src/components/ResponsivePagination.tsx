import { useRef, useState } from "react";
import { Group, Pagination, PaginationProps, Text } from "@mantine/core";
import { useIsomorphicEffect, useMediaQuery, useViewportSize } from "@mantine/hooks";

// 统一分页：窄屏按钮缩到 sm；整行页码在容器里放不下时塌缩为「‹ 当前/总数 ›」，且始终居中。
// 以 useViewportSize 作为重测触发器（窗口任意方向缩放都必定更新），再实时读容器宽度与离流的
// 完整页码自然宽度比较。容器须 overflow:hidden + minWidth:0，才能在内容更宽时仍缩到可用宽度。
export function ResponsivePagination({
  size,
  total,
  value,
  onChange,
  disabled,
  hideWithOnePage,
  mt,
  mb,
  ...rest
}: PaginationProps) {
  const small = useMediaQuery("(max-width: 30rem)");
  const effectiveSize = size ?? (small ? "sm" : "md");

  const { width: viewportWidth } = useViewportSize();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useIsomorphicEffect(() => {
    const wrap = wrapRef.current;
    const full = fullRef.current;
    if (!wrap || !full) return;
    const available = wrap.getBoundingClientRect().width;
    if (available) setCompact(full.offsetWidth > Math.ceil(available));
  }, [viewportWidth, total, value, effectiveSize]);

  if (hideWithOnePage && total <= 1) return null;

  const shared = { total, value, onChange, disabled, size: effectiveSize, ...rest };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}
    >
      <div
        ref={fullRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          // max-content：取页码真实自然宽度，避免被 overflow:hidden 的 wrap 宽度 clamp（否则永不塌缩）
          width: "max-content",
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        <Pagination {...shared} />
      </div>
      <Group justify="center" mt={mt} mb={mb}>
        {compact ? (
          <Pagination.Root {...shared}>
            <Group gap="xs">
              <Pagination.Previous />
              <Text size="sm" c="dimmed">
                {value ?? 1} / {total}
              </Text>
              <Pagination.Next />
            </Group>
          </Pagination.Root>
        ) : (
          <Pagination {...shared} />
        )}
      </Group>
    </div>
  );
}
