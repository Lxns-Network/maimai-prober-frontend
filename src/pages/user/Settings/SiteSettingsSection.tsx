import {
  Button,
  Card,
  ColorPicker,
  ColorSwatch,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { SettingList } from "@/components/Settings/SettingList.tsx";
import {
  useThemeColor,
  themeColors,
  DEFAULT_THEME_COLOR,
  isPresetThemeColor,
  isHexColor,
} from "@/hooks/useThemeColor.ts";
import { IconCheck, IconColorPicker } from "@tabler/icons-react";
import { useState } from "react";
import classes from "../../Page.module.css";

const colorSchemeOptions = [
  { value: "auto", label: "跟随系统" },
  { value: "light", label: "浅色模式" },
  { value: "dark", label: "深色模式" },
];

export const SiteSettingsSection = () => {
  const mantineTheme = useMantineTheme();
  const [themeColor, setThemeColor] = useThemeColor();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const isCustom = !isPresetThemeColor(themeColor);
  const committedHex = isCustom ? themeColor : (mantineTheme.colors[themeColor]?.[6] ?? "#1890ff");
  const [customInput, setCustomInput] = useState(committedHex);

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
                      key={color}
                      component="button"
                      type="button"
                      aria-label={color}
                      color={mantineTheme.colors[color][6]}
                      onClick={() => setThemeColor(color)}
                      size={28}
                      radius="md"
                      style={{ cursor: "pointer" }}
                    >
                      {themeColor === color && <IconCheck size={14} color="white" />}
                    </ColorSwatch>
                  ))}
                  <Popover
                    position="bottom-start"
                    withArrow
                    shadow="md"
                    onOpen={() => setCustomInput(committedHex)}
                  >
                    <Tooltip label={isCustom ? `自定义 (${themeColor})` : "自定义颜色"}>
                      <Popover.Target>
                        <ColorSwatch
                          component="button"
                          type="button"
                          aria-label="自定义颜色"
                          color={isCustom ? themeColor : "transparent"}
                          size={28}
                          radius="md"
                          style={{
                            cursor: "pointer",
                            border: isCustom ? undefined : "1px dashed var(--mantine-color-gray-5)",
                          }}
                        >
                          {isCustom ? (
                            <IconCheck
                              size={14}
                              color="white"
                              style={{ filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))" }}
                            />
                          ) : (
                            <IconColorPicker size={14} />
                          )}
                        </ColorSwatch>
                      </Popover.Target>
                    </Tooltip>
                    <Popover.Dropdown>
                      <Stack gap="xs">
                        <ColorPicker
                          format="hex"
                          value={committedHex}
                          onChange={setCustomInput}
                          onChangeEnd={setThemeColor}
                        />
                        <TextInput
                          size="xs"
                          placeholder="#1890ff"
                          value={customInput}
                          onChange={(event) => {
                            let val = event.currentTarget.value.trim();
                            if (val && !val.startsWith("#")) {
                              val = `#${val}`;
                            }
                            setCustomInput(val);
                            if (isHexColor(val)) {
                              setThemeColor(val);
                            }
                          }}
                        />
                      </Stack>
                    </Popover.Dropdown>
                  </Popover>
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
