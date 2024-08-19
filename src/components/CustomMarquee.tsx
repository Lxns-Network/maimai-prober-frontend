import { Children, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group } from "@mantine/core";

interface CustomMarqueeProps {
  speed?: number;
  delay?: number;
  interval?: number;
  children: ReactNode;
  props?: any;
}

export const CustomMarquee = ({ speed = 0.5, delay = 1000, interval = 1000, children, ...props }: CustomMarqueeProps) => {
  const [isScrolling, setIsScrolling] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isScrolling) {
      setTranslateX(0);
      return;
    }

    let direction = 1;
    let isPaused = false;

    const scroll = () => {
      if (!isPaused) {
        setTranslateX((prev) => {
          if (!ref.current) return 0;

          const newTranslateX = prev - direction * speed;
          const maxTranslateX = ref.current.scrollWidth - ref.current.clientWidth;

          if (newTranslateX <= -maxTranslateX - speed || newTranslateX >= speed) {
            isPaused = true;
            direction *= -1;

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
  }, [isScrolling]);

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