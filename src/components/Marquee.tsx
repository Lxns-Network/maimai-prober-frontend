import { Children, ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { Group } from "@mantine/core";
import { useHover } from "@mantine/hooks";

interface MarqueeProps {
  speed?: number;
  delay?: number;
  interval?: number;
  pauseOnHover?: boolean;
  children: ReactNode;
  props?: any;
}

export const Marquee = ({ speed = 0.5, delay = 1000, interval = 1000, pauseOnHover = true, children, ...props }: MarqueeProps) => {
  const { hovered, ref } = useHover();
  const [isScrolling, setIsScrolling] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!isScrolling) {
      setTranslateX(0);
      return;
    }

    let isPaused = hovered && pauseOnHover;

    const scroll = () => {
      if (!isPaused) {
        setTranslateX((prev) => {
          if (!ref.current) return 0;

          const newTranslateX = prev - direction * speed;
          const maxTranslateX = ref.current.scrollWidth - ref.current.clientWidth;

          if (newTranslateX <= -maxTranslateX - speed || newTranslateX >= speed) {
            isPaused = true;
            setDirection((prev) => -prev);

            setTimeout(() => {
              isPaused = false;
            }, interval);
          }

          return newTranslateX;
        });
      }
    };

    const intervalId = setInterval(scroll, 10);

    return () => clearInterval(intervalId);
  }, [isScrolling, direction, hovered]);

  useLayoutEffect(() => {
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