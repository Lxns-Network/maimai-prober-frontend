import { SimpleGrid, SimpleGridProps } from "@mantine/core";
import { ReactNode, useLayoutEffect, useRef } from "react";
import { motion, type Variants } from "motion/react";

const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const ANIM_S = 0.3;
const ANIM_MS = ANIM_S * 1000;

interface AnimatedGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  cols?: SimpleGridProps["cols"];
  spacing?: SimpleGridProps["spacing"];
}

export function AnimatedGrid<T>({
  items,
  getKey,
  renderItem,
  cols = { base: 1, "400px": 2, "700px": 3 },
  spacing = "xs",
}: AnimatedGridProps<T>) {
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

  return (
    <SimpleGrid
      type="container"
      cols={cols}
      spacing={spacing}
      style={{ position: "relative", width: "100%" }}
    >
      {items.map((item) => {
        const k = getKey(item);
        return (
          <motion.div
            key={k}
            ref={(el) => {
              if (el) itemEls.current.set(k, el);
              else itemEls.current.delete(k);
            }}
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: ANIM_S, ease: "easeOut" }}
          >
            {renderItem(item)}
          </motion.div>
        );
      })}
    </SimpleGrid>
  );
}
