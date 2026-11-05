import { ReactNode, useRef } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Indicator,
  MantineBreakpoint,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconFilter } from "@tabler/icons-react";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import classes from "./ScoreFilterDrawer.module.css";

const SMALL_SCREEN_QUERY = "(max-width: 30rem)";

export const ScoreFilterTitle = ({ count }: { count: number }) => (
  // 固定行高，避免角标出现/消失时标题行高度变化
  <Group gap="xs" wrap="nowrap" h={25}>
    <IconFilter size={20} />
    <Text fw={700}>筛选成绩</Text>
    {count > 0 && (
      <Badge variant="light" size="sm">
        {count}
      </Badge>
    )}
  </Group>
);

export const ScoreFilterButton = ({
  count,
  onClick,
  hiddenFrom,
}: {
  count: number;
  onClick: () => void;
  hiddenFrom?: MantineBreakpoint;
}) => {
  const small = useMediaQuery(SMALL_SCREEN_QUERY);

  return small ? (
    <Indicator label={count} size={16} disabled={count === 0} withBorder hiddenFrom={hiddenFrom}>
      <ActionIcon variant="default" size="input-sm" aria-label="筛选成绩" onClick={onClick}>
        <IconFilter size={20} />
      </ActionIcon>
    </Indicator>
  ) : (
    <Button
      variant="default"
      leftSection={<IconFilter size={20} />}
      rightSection={
        count > 0 ? (
          <Badge size="sm" circle>
            {count}
          </Badge>
        ) : null
      }
      onClick={onClick}
      hiddenFrom={hiddenFrom}
    >
      筛选
    </Button>
  );
};

/** 成绩筛选抽屉：窄屏为可下滑关闭的底部面板，其余为右侧抽屉；浏览器返回键会先关闭抽屉。 */
export const ScoreFilterDrawer = ({
  opened,
  onClose,
  count,
  children,
}: {
  opened: boolean;
  onClose: () => void;
  count: number;
  children: ReactNode;
}) => {
  const small = useMediaQuery(SMALL_SCREEN_QUERY);
  const sheetDrag = useRef<{ startY: number; content: HTMLElement } | null>(null);
  useBackDismiss(opened, onClose);

  const handleSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const content = event.currentTarget.closest(".mantine-Drawer-content") as HTMLElement | null;
    if (!content) return;
    sheetDrag.current = { startY: event.clientY, content };
    content.style.transition = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSheetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    const offsetY = Math.max(0, event.clientY - drag.startY);
    drag.content.style.transform = `translateY(${offsetY}px)`;
  };

  const handleSheetPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    sheetDrag.current = null;
    const offsetY = Math.max(0, event.clientY - drag.startY);
    drag.content.style.transition = "transform 200ms ease";
    if (event.type !== "pointercancel" && offsetY > 72) {
      drag.content.style.transform = "translateY(100%)";
      const overlay = document.querySelector<HTMLElement>(".mantine-Drawer-overlay");
      if (overlay) {
        overlay.style.transition = "opacity 200ms ease";
        overlay.style.opacity = "0";
      }
      window.setTimeout(onClose, 200);
    } else {
      drag.content.style.transform = "";
    }
  };

  const title = <ScoreFilterTitle count={count} />;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={small ? "bottom" : "right"}
      size={small ? "85%" : "md"}
      withCloseButton={!small}
      classNames={
        small
          ? {
              content: classes.bottomSheetContent,
              title: classes.bottomSheetTitle,
              body: classes.bottomSheetBody,
            }
          : undefined
      }
      scrollAreaComponent={ScrollArea.Autosize}
      title={
        small ? (
          <Stack
            gap={8}
            style={{ touchAction: "none" }}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
          >
            <div className={classes.dragHandle} />
            {title}
          </Stack>
        ) : (
          title
        )
      }
    >
      {children}
    </Drawer>
  );
};
