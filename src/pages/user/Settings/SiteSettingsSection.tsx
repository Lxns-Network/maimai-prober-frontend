import {
  Button,
  Card,
  ColorSwatch,
  Group,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { SettingList } from "@/components/Settings/SettingList.tsx";
import { useThemeColor, themeColors, DEFAULT_THEME_COLOR } from "@/hooks/useThemeColor.ts";
import { IconCheck } from "@tabler/icons-react";
import classes from "../../Page.module.css";
import { getReadableTextColor } from "@/utils/color.ts";

const colorSchemeOptions = [
  { value: "auto", label: "跟随系统" },
  { value: "light", label: "浅色模式" },
  { value: "dark", label: "深色模式" },
];

export const SiteSettingsSection = () => {
  const mantineTheme = useMantineTheme();
  const [themeColor, setThemeColor] = useThemeColor();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <div>
      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          外观设置
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          自定义站点的显示效果
        </Text>
        <SettingList
          data={[
            {
              key: "colorScheme",
              title: "配色方案",
              description: "选择站点的配色方案。",
              optionType: "select",
              defaultValue: "auto",
              options: colorSchemeOptions,
            },
            {
              key: "themeColor",
              title: "主题颜色",
              description: "选择站点的主题颜色。",
              optionType: "custom",
              render: () => (
                <Group gap="xs">
                  {themeColors.map((color) => (
                    <ColorSwatch
                      component="button"
                      type="button"
                      key={color}
                      color={mantineTheme.colors[color][6]}
                      onClick={() => setThemeColor(color)}
                      size={28}
                      radius="md"
                      aria-label={`使用 ${color} 主题色`}
                      aria-pressed={themeColor === color}
                    >
                      {themeColor === color && (
                        <IconCheck
                          size={14}
                          color={getReadableTextColor(mantineTheme.colors[color][6])}
                          aria-hidden="true"
                        />
                      )}
                    </ColorSwatch>
                  ))}
                  {themeColor !== DEFAULT_THEME_COLOR && (
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => setThemeColor(DEFAULT_THEME_COLOR)}
                    >
                      恢复默认
                    </Button>
                  )}
                </Group>
              ),
            },
          ]}
          value={{ colorScheme }}
          onChange={(_key, value) => value && setColorScheme(value as "auto" | "light" | "dark")}
        />
      </Card>
    </div>
  );
};
