import { Group, Switch, Text, Select, MultiSelect, Button } from '@mantine/core';
import { memo } from "react";
import classes from "./Settings.module.css";

interface OptionsProps {
  value: string;
  label: string;
}

interface SettingsProps {
  key: string;
  title: string;
  description: string;
  optionType: 'switch' | 'select' | 'multi-select' | 'button';
  // 可选参数
  placeholder?: string;
  color?: string; // 选项类型为 'button' 时需要
  defaultValue?: string | boolean | string[]; // string[] 选项类型为 'multi-select' 时需要
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
  if (!data) {
    return null;
  }

  return data.map((item) => (
    <Group justify="space-between" className={classes.item} wrap="nowrap" gap="xl" key={item.key}>
      <div>
        <Text>{item.title}</Text>
        <Text size="xs" c="dimmed">
          {item.description}
        </Text>
      </div>
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
    </Group>
  ));
});