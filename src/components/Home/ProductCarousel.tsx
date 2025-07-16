import { Carousel } from "@mantine/carousel";
import { EmblaCarouselType } from "embla-carousel";
import { useInViewport } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import useShellViewportSize from "@/hooks/useShellViewportSize.ts";
import Autoplay from "embla-carousel-autoplay";

import { Product } from "@/components/Home/Product.tsx";
import products from '@/data/products.json';

const isTouchScreen = () => {
  return window.matchMedia('(pointer: coarse)').matches;
};

export const ProductCarousel = () => {
  const autoplay = useRef(Autoplay({
    delay: 2000,
    playOnInit: false,
  }));
  const { ref, inViewport } = useInViewport();
  const { width } = useShellViewportSize();
  const [containerWidth, setContainerWidth] = useState(width);
  const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);

  useEffect(() => {
    if (width < 576) {
      setContainerWidth(width - 32);
    } else {
      setContainerWidth(width - 64);
    }
  }, [width]);

  useEffect(() => {
    if (embla) {
      embla.reInit();
    }
  }, [embla, containerWidth]);

  useEffect(() => {
    if (inViewport) {
      autoplay.current.play();
    } else {
      autoplay.current.stop();
    }
  }, [inViewport]);

  return (
    <Carousel
      slideSize={{ base: '100%', sm: '80%' }}
      slideGap="md"
      emblaOptions={{ loop: true }}
      draggable={isTouchScreen()}
      getEmblaApi={setEmbla}
      plugins={[autoplay.current]}
      onMouseEnter={autoplay.current.stop}
      onMouseLeave={autoplay.current.reset}
      style={{ maxWidth: containerWidth }}
      ref={ref}
      data-nosnippet
    >
      {products.map((product, index) => (
        <Carousel.Slide key={index}>
          <Product {...product} />
        </Carousel.Slide>
      ))}
    </Carousel>
  );
}