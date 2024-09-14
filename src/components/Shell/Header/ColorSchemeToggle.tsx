import { ActionIcon, Group, rem, Tooltip, useMantineColorScheme } from "@mantine/core";
import { IconMoonStars, IconSun, IconSunMoon } from "@tabler/icons-react";


const colorSchemes = {
  auto: {
    icon: <IconSunMoon stroke={1.5} />,
    label: '跟随系统',
    color: 'blue'
  },
  dark: {
    icon: <IconMoonStars stroke={1.5} />,
    label: '深色模式',
    color: 'blue'
  },
  light: {
    icon: <IconSun stroke={1.5} />,
    label: '浅色模式',
    color: 'yellow'
  }
}

export const ColorSchemeToggle = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Group justify="center">
      <Tooltip label={colorSchemes[colorScheme].label} position="left">
        <ActionIcon variant="light" size={rem(32)} onClick={() => setColorScheme(
          colorScheme === 'auto' ? 'dark' : colorScheme === 'dark' ? 'light' : 'auto'
        )} color={colorSchemes[colorScheme].color}>
          {colorSchemes[colorScheme].icon}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}