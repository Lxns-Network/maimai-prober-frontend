import { ActionIcon, Group, rem, Tooltip, useMantineColorScheme } from "@mantine/core";
import { IconMoonStars, IconSun, IconSunMoon } from "@tabler/icons-react";
import { match } from "ts-pattern";

const colorSchemes = {
  auto: {
    icon: <IconSunMoon stroke={1.5} />,
    label: "跟随系统",
    color: undefined,
  },
  dark: {
    icon: <IconMoonStars stroke={1.5} />,
    label: "深色模式",
    color: undefined,
  },
  light: {
    icon: <IconSun stroke={1.5} />,
    label: "浅色模式",
    color: "yellow",
  },
};

export const ColorSchemeToggle = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Group justify="center">
      <Tooltip label={colorSchemes[colorScheme].label} position="left">
        <ActionIcon
          variant="light"
          size={rem(32)}
          onClick={() =>
            setColorScheme(
              match(colorScheme)
                .with("auto", () => "dark" as const)
                .with("dark", () => "light" as const)
                .with("light", () => "auto" as const)
                .exhaustive(),
            )
          }
          color={colorSchemes[colorScheme].color}
        >
          {colorSchemes[colorScheme].icon}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};
