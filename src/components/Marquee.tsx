import { Children, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, GroupProps } from "@mantine/core";
import { useHoverDirty } from "react-use";
import { useAnimationFrame } from "motion/react"

interface MarqueeProps {
  speed?: number;
  startDelay?: number; // 开始滚动的延迟
  intervalDelay?: number; // 滚动间隔
  pauseOnHover?: boolean; // 鼠标悬停暂停滚动
  children: ReactNode;
  props?: any;
}

export const Marquee = (
  { speed = 0.5, startDelay = 1000, intervalDelay = 1000, pauseOnHover = true, children, ...props }: MarqueeProps & GroupProps
) => {
  const [isScrolling, setIsScrolling] = useState(false); // 是否需要滚动
  const [isPaused, setIsPaused] = useState(false); // 是否暂停滚动
  const [translateX, setTranslateX] = useState(0);

  const directionRef = useRef(1);
  const delayUntilRef = useRef(0);

  const ref = useRef<HTMLDivElement>(null);
  const isHovering = useHoverDirty(ref); // 是否鼠标悬停

  useAnimationFrame((time) => {
    if (!isScrolling || isPaused) return;

    // 若处于延迟期，不滚动
    if (delayUntilRef.current && time < delayUntilRef.current) return;

    if (!ref.current) return;

    setTranslateX((prev) => {
      const newTranslateX = prev - directionRef.current * speed;
      const maxTranslateX = ref.current!.scrollWidth - ref.current!.clientWidth;

      if (newTranslateX <= -maxTranslateX - speed || newTranslateX >= speed) {
        directionRef.current = -directionRef.current; // 反转方向
        delayUntilRef.current = time + intervalDelay; // 设置延迟截止时间
        return prev; // 暂停这一帧，等下次再移动
      }

      return newTranslateX;
    });
  });

  useEffect(() => {
    if (!isScrolling) {
      setTranslateX(0);
    }
  }, [isScrolling]);

  useLayoutEffect(() => {
    if (pauseOnHover) {
      setIsPaused(isHovering);
    }

    if (ref.current && ref.current.scrollWidth > ref.current.clientWidth) {
      setTimeout(() => {
        setIsScrolling(true);
      }, startDelay);
    } else {
      setIsScrolling(false);
    }
  });

  return (
    <Group ref={ref} style={{
      ...props.style,
      overflowX: "hidden"
    }} {...props}>
      {Children.map(children, (child) => (
        <div style={{
          flexShrink: 0,
          transform: `translateX(${translateX}px)`,
          wordBreak: 'break-all'
        }}>{child}</div>
      ))}
    </Group>
  )
}