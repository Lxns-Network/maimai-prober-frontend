import { Carousel } from "@mantine/carousel";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { EmblaCarouselType } from "embla-carousel";
import { useInViewport, useReducedMotion } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import useShellViewportSize from "@/hooks/useShellViewportSize.ts";
import Autoplay from "embla-carousel-autoplay";

import { Product } from "@/components/Home/Product.tsx";
import products from "@/data/products.json";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";

const isTouchScreen = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
};

export const ProductCarousel = () => {
  const autoplay = useRef(
    Autoplay({
      delay: 2000,
      playOnInit: false,
    }),
  );
  const { ref, inViewport } = useInViewport();
  const { width } = useShellViewportSize();
  const reducedMotion = useReducedMotion();
  const [containerWidth, setContainerWidth] = useState(width);
  const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (width < 576) {
      setContainerWidth(Math.max(0, width - 32));
    } else {
      setContainerWidth(Math.max(0, width - 64));
    }
  }, [width]);

  useEffect(() => {
    if (embla) {
      embla.reInit();
    }
  }, [embla, containerWidth]);

  useEffect(() => {
    if (inViewport && !paused && !reducedMotion) {
      autoplay.current.play();
    } else {
      autoplay.current.stop();
    }
  }, [inViewport, paused, reducedMotion]);

  return (
    <div style={{ maxWidth: containerWidth }}>
      {!reducedMotion && (
        <Group justify="flex-end" mb="xs">
          <Tooltip label={paused ? "继续自动轮播" : "暂停自动轮播"}>
            <ActionIcon
              aria-label={paused ? "继续自动轮播" : "暂停自动轮播"}
              aria-pressed={paused}
              variant="subtle"
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? <IconPlayerPlay /> : <IconPlayerPause />}
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
      <Carousel
        slideSize={{ base: "100%", sm: "80%" }}
        slideGap="md"
        emblaOptions={{ loop: true }}
        draggable={isTouchScreen()}
        getEmblaApi={setEmbla}
        plugins={[autoplay.current]}
        onMouseEnter={autoplay.current.stop}
        onMouseLeave={() => {
          if (!paused && !reducedMotion) autoplay.current.play();
        }}
        onFocusCapture={autoplay.current.stop}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget) && !paused && !reducedMotion) {
            autoplay.current.play();
          }
        }}
        ref={ref}
        data-nosnippet
      >
        {products.map((product, index) => (
          <Carousel.Slide key={index}>
            <Product {...product} />
          </Carousel.Slide>
        ))}
      </Carousel>
    </div>
  );
};
