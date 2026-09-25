import { Avatar, Badge, Button, Card, Group, Text } from "@mantine/core";
import { useInViewport } from "@mantine/hooks";
import { IconArrowUpRight } from "@tabler/icons-react";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef, useState } from "react";

import products from "@/data/products.json";

import classes from "./EcosystemCarousel.module.css";

const ROTATION_INTERVAL_MS = 3000;
const TICK_INTERVAL_MS = 50;
const RESUME_AUTOPLAY_DELAY_MS = 3000;

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
        <Text className={classes.title}>
          {item.title}
        </Text>
        <Group gap={6}>
          {item.tags.map((tag) => (
            <Badge key={tag} variant="default" radius="md">
              {tag}
            </Badge>
          ))}
        </Group>
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

  const [isDraggingDots, setIsDraggingDots] = useState(false);
  const isPointerDownRef = useRef(false);
  const dragMovedRef = useRef(false);
  const startXRef = useRef(0);

  const elapsedRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const scheduleAutoplayResume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      setIsAutoPlaying(true);
      elapsedRef.current = 0;
    }, RESUME_AUTOPLAY_DELAY_MS);
  }, [clearResumeTimer]);

  const pauseAutoplay = useCallback(() => {
    clearResumeTimer();
    setIsAutoPlaying(false);
    elapsedRef.current = 0;
  }, [clearResumeTimer]);

  useEffect(() => {
    return () => clearResumeTimer();
  }, [clearResumeTimer]);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setActiveIndex(emblaApi.selectedScrollSnap());
      setIsSettled(false);
      elapsedRef.current = 0;
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
  }, [emblaApi, pauseAutoplay, scheduleAutoplayResume]);

  useEffect(() => {
    if (!inViewport || !isSettled || isHovered || isDraggingDots || !isAutoPlaying || !emblaApi) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      elapsedRef.current += TICK_INTERVAL_MS;

      if (elapsedRef.current >= ROTATION_INTERVAL_MS) {
        emblaApi.scrollNext();
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [inViewport, isSettled, isHovered, isDraggingDots, isAutoPlaying, emblaApi]);

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

        <div
          className={classes.dots}
          ref={dotsRef}
          data-dragging={isDraggingDots || undefined}
          role="slider"
          tabIndex={0}
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
    </Card>
  );
};
