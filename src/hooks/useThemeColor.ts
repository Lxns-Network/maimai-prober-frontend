import { useLocalStorage } from "@mantine/hooks";

export const themeColors = [
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
] as const;

export type PresetThemeColor = (typeof themeColors)[number];
export type ThemeColor = PresetThemeColor | (string & {});

export const DEFAULT_THEME_COLOR: PresetThemeColor = "blue";

export function isPresetThemeColor(color: string): color is PresetThemeColor {
  return (themeColors as readonly string[]).includes(color);
}

export function isHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color);
}

export function useThemeColor(): [ThemeColor, (color: ThemeColor) => void] {
  const [color, setColor] = useLocalStorage<ThemeColor>({
    key: "mantine-primary-color-value",
    defaultValue: DEFAULT_THEME_COLOR,
  });

  return [color, setColor];
}
