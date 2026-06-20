import { SimpleGrid, SimpleGridProps, Stack, StackProps } from "@mantine/core";
import { ReactNode, useLayoutEffect, useRef } from "react";
import { motion, type Variants } from "motion/react";

const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const ANIM_S = 0.3;
const ANIM_MS = ANIM_S * 1000;

// 手写 FLIP:位置取 offsetLeft/offsetTop(相对容器、不含页面滚动量),所以滚动钳位下卡片不歪;
// 新卡片淡入、被移除的卡片直接卸载(不撑高滚动条)。返回一个工厂,给每个 item 生成 motion.div 的 props。
function useFlipList<T>(items: T[], getKey: (item: T) => string) {
  const itemEls = useRef(new Map<string, HTMLDivElement>());
  const prevPos = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    items.forEach((item) => {
      const k = getKey(item);
      const el = itemEls.current.get(k);
      if (!el) return;
      const x = el.offsetLeft;
      const y = el.offsetTop;
      next.set(k, { x, y });
      const prev = prevPos.current.get(k);
      if (prev && (prev.x !== x || prev.y !== y)) {
        el.animate(
          [
            { transform: `translate(${prev.x - x}px, ${prev.y - y}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: ANIM_MS, easing: "ease-out" },
        );
      }
    });
    prevPos.current = next;
  }, [items, getKey]);

  return (item: T) => {
    const k = getKey(item);
    return {
      ref: (el: HTMLDivElement | null) => {
        if (el) itemEls.current.set(k, el);
        else itemEls.current.delete(k);
      },
      variants: fadeVariants,
      initial: "hidden" as const,
      animate: "visible" as const,
      transition: { duration: ANIM_S },
    };
  };
}

interface AnimatedListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}

interface AnimatedGridProps<T> extends AnimatedListProps<T> {
  cols?: SimpleGridProps["cols"];
  spacing?: SimpleGridProps["spacing"];
}

/** 容器查询网格 + FLIP 动画,适合卡片网格(成绩、别名、集合曲目等)。 */
export function AnimatedGrid<T>({
  items,
  getKey,
  renderItem,
  cols = { base: 1, "400px": 2, "700px": 3 },
  spacing = "xs",
}: AnimatedGridProps<T>) {
  const itemProps = useFlipList(items, getKey);
  return (
    <SimpleGrid
      type="container"
      cols={cols}
      spacing={spacing}
      style={{ position: "relative", width: "100%" }}
    >
      {items.map((item) => (
        <motion.div key={getKey(item)} {...itemProps(item)}>
          {renderItem(item)}
        </motion.div>
      ))}
    </SimpleGrid>
  );
}

interface AnimatedStackProps<T> extends AnimatedListProps<T> {
  gap?: StackProps["gap"];
}

/** 纵向列表 + 同一套 FLIP 动画,适合卡片列表(开发者列表、谱面难度等)。 */
export function AnimatedStack<T>({ items, getKey, renderItem, gap }: AnimatedStackProps<T>) {
  const itemProps = useFlipList(items, getKey);
  return (
    <Stack gap={gap} style={{ position: "relative", width: "100%" }}>
      {items.map((item) => (
        <motion.div key={getKey(item)} {...itemProps(item)}>
          {renderItem(item)}
        </motion.div>
      ))}
    </Stack>
  );
}
