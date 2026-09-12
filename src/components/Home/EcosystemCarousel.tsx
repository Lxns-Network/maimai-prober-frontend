import { Avatar, Button, Card, Text, Title } from "@mantine/core";
import { useInViewport } from "@mantine/hooks";
import { IconArrowUpRight } from "@tabler/icons-react";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef, useState } from "react";

import products from "@/data/products.json";

import classes from "./EcosystemCarousel.module.css";

const ROTATION_INTERVAL_MS = 3000;
const TICK_INTERVAL_MS = 50;
const RESUME_AUTOPLAY_DELAY_MS = 3000;

// 卡片内容全部来自静态 JSON，提升到模块级复用同一批元素，避免每次渲染重建
const slides = products.map((item) => (
  <div className={classes.slide} key={item.title}>
    <div className={classes.header}>
      <Avatar
        src={`./product/${item.image}.webp`}
        alt={item.title}
        size={58}
        radius="md"
        className={classes.avatar}
      />
      <div className={classes.meta}>
        <Title order={3} className={classes.title}>
          {item.title}
        </Title>
        <Text component="span" className={classes.tags}>
          {item.tags.join(" · ")}
        </Text>
      </div>
    </div>

    <Text className={classes.description}>{item.description}</Text>
  </div>
));

export const EcosystemCarousel = () => {
  const { ref: inViewportRef, inViewport } = useInViewport<HTMLDivElement>();
  const dotsRef = useRef<HTMLDivElement | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [isSettled, setIsSettled] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // 圆点条拖拽状态
  const [isDraggingDots, setIsDraggingDots] = useState(false);
  const isPointerDownRef = useRef(false);
  const dragMovedRef = useRef(false);
  const startXRef = useRef(0);

  const elapsedRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  // 进度条宽度是每 50ms 更新一次的瞬态值，直写 DOM 避免高频重渲染
  const setProgressWidth = useCallback((pct: number) => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct}%`;
    }
  }, []);

  const scheduleAutoplayResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      setIsAutoPlaying(true);
      elapsedRef.current = 0;
      setProgressWidth(0);
    }, RESUME_AUTOPLAY_DELAY_MS);
  }, [clearResumeTimer, setProgressWidth]);

  const pauseAutoplay = useCallback(() => {
    clearResumeTimer();
    setIsAutoPlaying(false);
    elapsedRef.current = 0;
    setProgressWidth(0);
  }, [clearResumeTimer, setProgressWidth]);

  useEffect(() => {
    return () => clearResumeTimer();
  }, [clearResumeTimer]);

  // 监听 Embla 选定页与拖拽交互
  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setActiveIndex(emblaApi.selectedScrollSnap());
      setIsSettled(false);
      elapsedRef.current = 0;
      setProgressWidth(0);
    };

    const onPointerDown = () => {
      pauseAutoplay();
    };
    const onPointerUp = () => {
      scheduleAutoplayResume();
    };
    const onSettle = () => {
      setIsSettled(true);
      elapsedRef.current = 0;
      setProgressWidth(0);
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    emblaApi.on("settle", onSettle);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
      emblaApi.off("settle", onSettle);
    };
  }, [emblaApi, pauseAutoplay, scheduleAutoplayResume, setProgressWidth]);

  // 自动翻页定时器：仅在翻页动画完全结束（isSettled）后才开始计时；翻页后由 select 事件复位计时
  useEffect(() => {
    if (!inViewport || !isSettled || isHovered || isDraggingDots || !isAutoPlaying || !emblaApi) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      elapsedRef.current += TICK_INTERVAL_MS;
      setProgressWidth(Math.min((elapsedRef.current / ROTATION_INTERVAL_MS) * 100, 100));

      if (elapsedRef.current >= ROTATION_INTERVAL_MS) {
        emblaApi.scrollNext();
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [inViewport, isSettled, isHovered, isDraggingDots, isAutoPlaying, emblaApi, setProgressWidth]);

  // 圆点指示器拖拽/点击交互：按最近圆点中心取目标，避免两端点击错位
  const updateIndexFromDots = (clientX: number) => {
    if (!emblaApi) return;
    const el = dotsRef.current;
    if (!el) return;
    let targetIndex = -1;
    let bestDistance = Infinity;
    Array.from(el.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        targetIndex = index;
      }
    });

    if (targetIndex >= 0 && targetIndex !== emblaApi.selectedScrollSnap()) {
      emblaApi.scrollTo(targetIndex);
    }
  };

  const handleDotsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    isPointerDownRef.current = true;
    dragMovedRef.current = false;
    startXRef.current = event.clientX;
    pauseAutoplay();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateIndexFromDots(event.clientX);
  };

  const handleDotsPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    if (!dragMovedRef.current) {
      if (Math.abs(event.clientX - startXRef.current) > 3) {
        dragMovedRef.current = true;
        setIsDraggingDots(true);
        updateIndexFromDots(event.clientX);
      }
    } else {
      updateIndexFromDots(event.clientX);
    }
  };

  const handleDotsPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isPointerDownRef.current = false;
    dragMovedRef.current = false;
    setIsDraggingDots(false);
    scheduleAutoplayResume();
  };

  const handleDotsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!emblaApi) return;

    switch (event.key) {
      case "ArrowLeft":
        emblaApi.scrollPrev();
        break;
      case "ArrowRight":
        emblaApi.scrollNext();
        break;
      case "Home":
        emblaApi.scrollTo(0);
        break;
      case "End":
        emblaApi.scrollTo(products.length - 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    pauseAutoplay();
    scheduleAutoplayResume();
  };

  const current = products[activeIndex] ?? products[0];

  return (
    <Card
      className={classes.card}
      withBorder
      ref={inViewportRef}
      onMouseEnter={() => {
        setIsHovered(true);
        clearResumeTimer();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isAutoPlaying) {
          scheduleAutoplayResume();
        }
      }}
      data-nosnippet
    >
      {/* Embla 原生横向平滑滑动视口 */}
      <div className={classes.viewport} ref={emblaRef}>
        <div className={classes.container}>{slides}</div>
      </div>

      <div className={classes.footer}>
        <Button
          component="a"
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          radius="md"
          rightSection={<IconArrowUpRight size={16} aria-hidden />}
        >
          {current.button}
        </Button>

        {/* 保持原样视觉、支持按住拖动滑动的圆点指示器条 */}
        <div
          className={classes.dots}
          ref={dotsRef}
          data-dragging={isDraggingDots || undefined}
          role="slider"
          tabIndex={0}
          aria-label="拖动或点击切换项目"
          aria-valuemin={1}
          aria-valuemax={products.length}
          aria-valuenow={activeIndex + 1}
          aria-valuetext={current.title}
          onPointerDown={handleDotsPointerDown}
          onPointerMove={handleDotsPointerMove}
          onPointerUp={handleDotsPointerEnd}
          onPointerCancel={handleDotsPointerEnd}
          onKeyDown={handleDotsKeyDown}
        >
          {products.map((item, index) => (
            <span
              key={item.title}
              className={classes.dot}
              data-active={index === activeIndex || undefined}
              aria-hidden
            />
          ))}
        </div>
      </div>

      {/* 底部自动翻页倒计时细条 */}
      {isAutoPlaying && !isHovered && !isDraggingDots && (
        <div className={classes.progressBar} ref={progressBarRef} aria-hidden />
      )}
    </Card>
  );
};
