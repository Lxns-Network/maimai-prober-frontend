import { MantineColor } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";

export const themeColors: MantineColor[] = [
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
];

export const DEFAULT_THEME_COLOR: MantineColor = "blue";

export function useThemeColor(): [MantineColor, (color: MantineColor) => void] {
  const [color, setColor] = useLocalStorage<MantineColor>({
    key: "mantine-primary-color-value",
    defaultValue: DEFAULT_THEME_COLOR,
  });

  return [color, setColor];
}
