import { useEffect, useState } from "react";

type Palette = readonly [string | undefined, string | undefined];

const EMPTY_PALETTE: Palette = [undefined, undefined];

interface ColorBucket {
  count: number;
  red: number;
  green: number;
  blue: number;
}

function toCssColor(bucket: ColorBucket): string {
  return `rgb(${Math.round(bucket.red / bucket.count)} ${Math.round(bucket.green / bucket.count)} ${Math.round(bucket.blue / bucket.count)})`;
}

function colorDistance(first: ColorBucket, second: ColorBucket): number {
  const firstRed = first.red / first.count;
  const firstGreen = first.green / first.count;
  const firstBlue = first.blue / first.count;
  const secondRed = second.red / second.count;
  const secondGreen = second.green / second.count;
  const secondBlue = second.blue / second.count;

  return Math.hypot(firstRed - secondRed, firstGreen - secondGreen, firstBlue - secondBlue);
}

function extractPalette(image: HTMLImageElement): Palette {
  const canvas = document.createElement("canvas");
  const maxSize = 32;
  const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return EMPTY_PALETTE;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<number, ColorBucket>();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = (red >> 6) * 16 + (green >> 6) * 4 + (blue >> 6);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()].sort((first, second) => second.count - first.count);
  const primary = ranked[0];
  if (!primary) return EMPTY_PALETTE;

  const secondary = ranked.find((bucket) => colorDistance(primary, bucket) >= 72) ?? ranked[1];
  return [toCssColor(primary), secondary ? toCssColor(secondary) : toCssColor(primary)];
}

/** Loads a cross-origin image and returns two lightweight dominant colors for decorative UI. */
export function useImagePalette(src: string | undefined): Palette {
  const [palette, setPalette] = useState<Palette>(EMPTY_PALETTE);

  useEffect(() => {
    if (!src) {
      setPalette(EMPTY_PALETTE);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) return;
      try {
        setPalette(extractPalette(image));
      } catch {
        setPalette(EMPTY_PALETTE);
      }
    };
    image.onerror = () => {
      if (!cancelled) setPalette(EMPTY_PALETTE);
    };
    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  return palette;
}
