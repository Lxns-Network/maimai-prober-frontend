import { Group, Switch, Text, Select, MultiSelect, Button, Box } from '@mantine/core';
import { memo } from "react";
import classes from "./Settings.module.css";
import { useMediaQuery } from "@mantine/hooks";
import { SettingsModalButton } from "./SettingsModal.tsx";

interface OptionsProps {
  value: string;
  label: string;
}

export interface SettingsProps {
  key: string;
  title: string;
  description: string;
  optionType: 'switch' | 'select' | 'multi-select' | 'button' | 'group';
  // 可选参数
  placeholder?: string;
  color?: string; // 选项类型为 'button' 时需要
  defaultValue?: string | boolean | string[]; // string[] 选项类型为 'multi-select' 时需要
  settings?: SettingsProps[]; // 选项类型为 'group' 时需要
  options?: OptionsProps[]; // 选项类型为 'select' 或 'multi-select' 时需要
  onChange?: (value: any) => void; // 选项更改时的回调函数
  onClick?: () => void; // 选项类型为 'button' 时需要
}

interface SettingsCardProps {
  data: SettingsProps[];
  value?: any;
  onChange?: (key: string, value: any) => void;
}

export const SettingsSection = memo(({ data, value, onChange }: SettingsCardProps) => {
  const small = useMediaQuery('(max-width: 450px)');

  if (!data) {
    return null;
  }

  return data.map((item) => (
    <Group justify="space-between" className={classes.item} wrap={"wrap"} key={item.key}>
      <Box style={{ flex: 1 }}>
        <Text>{item.title}</Text>
        <Text size="xs" c="dimmed">
          {item.description}
        </Text>
      </Box>
      <Box style={{ flexBasis: small && item.optionType.includes("select") ? "100%" : "auto" }}>
        {item.optionType === 'group' && (
          <SettingsModalButton title={item.title} data={item.settings || []} value={value} onChange={(key, value) => onChange && onChange(key, value)} />
        )}
        {item.optionType === 'switch' && (
          <Switch
            onLabel="开"
            offLabel="关"
            className={classes.switch}
            size="lg"
            checked={(value !== null && value.hasOwnProperty(item.key)) ? value[item.key] : item.defaultValue}
            onChange={(event) => onChange && onChange(item.key, event.currentTarget.checked)}
          />
        )}
        {item.optionType === 'select' && (
          <Select
            variant="filled"
            data={item.options || []}
            value={(value !== null && value.hasOwnProperty(item.key)) ? value[item.key] : item.defaultValue as string}
            comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
            onChange={(value) => onChange && onChange(item.key, value)}
          />
        )}
        {item.optionType === 'multi-select' && (
          <MultiSelect
            variant="filled"
            data={item.options || []}
            placeholder={item.placeholder}
            value={(value !== null && value.hasOwnProperty(item.key)) ? value[item.key] : item.defaultValue as string[]}
            comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
            onChange={(value) => onChange && onChange(item.key, value)}
          />
        )}
        {item.optionType === 'button' && (
          <Button
            variant="outline"
            color={item.color || 'blue'}
            onClick={item.onClick}
          >
            {item.placeholder}
          </Button>
        )}
      </Box>
    </Group>
  ));
});