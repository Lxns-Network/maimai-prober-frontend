import { Children, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group } from "@mantine/core";
import { useHoverDirty, useInterval } from "react-use";

interface MarqueeProps {
  speed?: number;
  startDelay?: number; // 开始滚动的延迟
  intervalDelay?: number; // 滚动间隔
  pauseOnHover?: boolean; // 鼠标悬停暂停滚动
  children: ReactNode;
  props?: any;
}

export const Marquee = ({ speed = 0.5, startDelay = 1000, intervalDelay = 1000, pauseOnHover = true, children, ...props }: MarqueeProps) => {
  const [isScrolling, setIsScrolling] = useState(false); // 是否需要滚动
  const [isPaused, setIsPaused] = useState(false); // 是否暂停滚动
  const [translateX, setTranslateX] = useState(0);
  const [direction, setDirection] = useState(1);
  const [delay, setDelay] = useState(startDelay); // 滚动延迟
  const ref = useRef<HTMLDivElement>(null);
  const isHovering = useHoverDirty(ref); // 是否鼠标悬停

  useInterval(
    () => {
      setDelay(10);
      setTranslateX((prev) => {
        if (!ref.current) return 0;

        const newTranslateX = prev - direction * speed;
        const maxTranslateX = ref.current.scrollWidth - ref.current.clientWidth;

        if (newTranslateX <= -maxTranslateX - speed || newTranslateX >= speed) {
          setDirection((prev) => -prev);
        }

        return newTranslateX;
      });
    },
    isScrolling && !isPaused ? delay : null
  );

  useEffect(() => {
    setDelay(intervalDelay);
  }, [direction]);

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
      }, delay);
    } else {
      setIsScrolling(false);
    }
  });

  return <Group ref={ref} style={{overflowX: "hidden"}} {...props}>
    {Children.map(children, (child) => (
      <div style={{
        flexShrink: 0,
        transform: `translateX(${translateX}px)`
      }}>{child}</div>
    ))}
  </Group>
}