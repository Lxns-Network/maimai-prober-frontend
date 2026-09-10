import { Children, ReactNode, useRef, useState } from "react";
import { Group, GroupProps } from "@mantine/core";
import { useHoverDirty } from "react-use";
import { useAnimationFrame } from "motion/react";

interface MarqueeProps {
  speed?: number;
  startDelay?: number;
  intervalDelay?: number;
  pauseOnHover?: boolean;
  children: ReactNode;
}

export const Marquee = ({
  speed = 0.5,
  startDelay = 1000,
  intervalDelay = 1000,
  pauseOnHover = true,
  children,
  ...props
}: MarqueeProps & GroupProps) => {
  const scrollingRef = useRef(false);
  const [translateX, setTranslateX] = useState(0);

  const directionRef = useRef(1);
  const delayUntilRef = useRef(0);

  const ref = useRef<HTMLDivElement>(null);
  const isHovering = useHoverDirty(ref as React.RefObject<Element>);

  useAnimationFrame((time) => {
    if (!ref.current) return;
    const maxTranslateX = ref.current.scrollWidth - ref.current.clientWidth;
    if (maxTranslateX <= 0) {
      scrollingRef.current = false;
      directionRef.current = 1;
      setTranslateX(0);
      return;
    }
    if (!scrollingRef.current) {
      scrollingRef.current = true;
      delayUntilRef.current = time + startDelay;
    }
    if ((pauseOnHover && isHovering) || time < delayUntilRef.current) return;

    setTranslateX((prev) => {
      const newTranslateX = prev - directionRef.current * speed;

      if (newTranslateX <= -maxTranslateX - speed || newTranslateX >= speed) {
        directionRef.current = -directionRef.current;
        delayUntilRef.current = time + intervalDelay;
        return prev; // 暂停这一帧，等下次再移动
      }

      return newTranslateX;
    });
  });

  return (
    <Group
      ref={ref}
      style={{
        ...props.style,
        overflowX: "hidden",
      }}
      {...props}
    >
      {Children.map(children, (child) => (
        <div
          style={{
            flexShrink: 0,
            transform: `translateX(${translateX}px)`,
            wordBreak: "break-all",
          }}
        >
          {child}
        </div>
      ))}
    </Group>
  );
};
