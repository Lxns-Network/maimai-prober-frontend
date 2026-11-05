import { Image, type ImageProps } from "@mantine/core";
import { type Game } from "@/types/game";

/**
 * FC / FS / AP 等小图标，空值显示占位图标。
 * 中二节奏使用 `_xs` 小图标素材；整条横幅样式的素材不走这里。
 */
export const MusicIcon = ({
  game,
  value,
  fallback,
  size = 24,
  suffix = game === "chunithm" ? "_xs" : "",
  h = size,
  w = size,
  ...imageProps
}: {
  game: Game;
  value?: string | null;
  fallback?: string;
  size?: number;
  suffix?: string;
} & Omit<ImageProps, "src">) => (
  <Image
    src={`/assets/${game}/music_icon/${value || fallback || "blank"}${suffix}.webp`}
    h={h}
    w={w}
    {...imageProps}
  />
);
