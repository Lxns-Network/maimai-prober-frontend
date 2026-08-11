import { Children, ReactNode, useLayoutEffect, useRef } from "react";
import { Group, GroupProps } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";

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
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: MarqueeProps & GroupProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const startTimerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const cancelAnimation = () => {
      if (startTimerRef.current !== null) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      animationRef.current?.cancel();
      animationRef.current = null;
      content.style.transform = "translate3d(0, 0, 0)";
    };

    const updateAnimation = () => {
      cancelAnimation();
      if (reducedMotion) return;

      const distance = content.scrollWidth - container.clientWidth;
      if (distance <= 0) return;

      startTimerRef.current = window.setTimeout(
        () => {
          const pixelsPerSecond = Math.max(speed * 60, 1);
          const travelDuration = (distance / pixelsPerSecond) * 1000;
          const holdDuration = Math.max(intervalDelay, 0);
          const totalDuration = travelDuration * 2 + holdDuration * 2;
          const outboundEnd = travelDuration / totalDuration;
          const outboundHoldEnd = (travelDuration + holdDuration) / totalDuration;
          const returnEnd = (travelDuration * 2 + holdDuration) / totalDuration;
          const endTransform = `translate3d(${-distance}px, 0, 0)`;

          animationRef.current = content.animate(
            [
              { transform: "translate3d(0, 0, 0)", offset: 0 },
              { transform: endTransform, offset: outboundEnd },
              { transform: endTransform, offset: outboundHoldEnd },
              { transform: "translate3d(0, 0, 0)", offset: returnEnd },
              { transform: "translate3d(0, 0, 0)", offset: 1 },
            ],
            {
              duration: totalDuration,
              iterations: Infinity,
              easing: "linear",
            },
          );

          if (hoveringRef.current && pauseOnHover) animationRef.current.pause();
          startTimerRef.current = null;
        },
        Math.max(startDelay, 0),
      );
    };

    const observer = new ResizeObserver(updateAnimation);
    observer.observe(container);
    observer.observe(content);
    updateAnimation();

    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) updateAnimation();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimation();
    };
  }, [intervalDelay, pauseOnHover, reducedMotion, speed, startDelay]);

  return (
    <Group
      ref={containerRef}
      wrap="nowrap"
      onMouseEnter={(event) => {
        hoveringRef.current = true;
        if (pauseOnHover) animationRef.current?.pause();
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        hoveringRef.current = false;
        if (pauseOnHover) animationRef.current?.play();
        onMouseLeave?.(event);
      }}
      {...props}
      style={{
        ...style,
        overflowX: "hidden",
      }}
    >
      <div
        ref={contentRef}
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          gap: "var(--group-gap)",
          minWidth: "max-content",
          willChange: reducedMotion ? undefined : "transform",
        }}
      >
        {Children.map(children, (child) => (
          <div style={{ flexShrink: 0, wordBreak: "break-all" }}>{child}</div>
        ))}
      </div>
    </Group>
  );
};
