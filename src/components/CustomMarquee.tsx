import { Children, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import Marquee from "react-fast-marquee";
import { Box } from "@mantine/core";

export const CustomMarquee = ({ children }: { children: ReactNode }) => {
  const [play, setPlay] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;

    const child = ref.current.getElementsByClassName("rfm-child")[0];
    if (child.clientWidth <= ref.current.clientWidth) {
      setPlay(false);
    }
  });

  useEffect(() => {
    if (play) return;

    setTimeout(() => {
      setPlay(true);
    }, 1000);
  }, [play]);

  return (
    <Marquee ref={ref} delay={1} onCycleComplete={() => setPlay(false)} play={play} style={{
      zIndex: 0,
    }}>
      {Children.map(children, (child) => (
        <Box mr="md" style={{
          wordBreak: "break-all",
          overflowWrap: "anywhere",
        }}>
          {child}
        </Box>
      ))}
    </Marquee>
  )
}