import { Switch, Text, Select, MultiSelect, Button, Box, UnstyledButton, Flex } from '@mantine/core';
import { memo, useState } from "react";
import classes from "./Settings.module.css";
import { useMediaQuery } from "@mantine/hooks";
import { SettingsModal } from "./SettingsModal.tsx";
import { IconChevronRight } from "@tabler/icons-react";

interface OptionProps {
  value: string;
  label: string;
}

export interface SettingProps {
  key: string;
  title: string;
  description: string;
  optionType: 'switch' | 'select' | 'multi-select' | 'button' | 'group';
  // 可选参数
  placeholder?: string;
  color?: string; // 选项类型为 'button' 时需要
  defaultValue?: string | boolean | string[]; // string[] 选项类型为 'multi-select' 时需要
  settings?: SettingProps[]; // 选项类型为 'group' 时需要
  options?: OptionProps[]; // 选项类型为 'select' 或 'multi-select' 时需要
  onChange?: (value: any) => void; // 选项更改时的回调函数
  onClick?: () => void; // 选项类型为 'button' 时需要
}

const Setting = ({ data, value, onChange }: {
  data: SettingProps;
  value?: any;
  onChange?: (key: string, value: any) => void;
}) => {
  const [opened, setOpened] = useState(false);
  const small = useMediaQuery('(max-width: 450px)');

  return (
    <>
      <SettingsModal title={data.title} data={data.settings || []} value={value} opened={opened} onClose={() => setOpened(false)} onChange={onChange} />
      <UnstyledButton w="100%" className={classes.item} onClick={() => {
        if (data.optionType === 'group') {
          setOpened(true);
        }
      }} style={{
        cursor: data.optionType === 'group' ? 'pointer' : 'default',
      }}>
        <Flex justify="space-between" align="center" columnGap="md" rowGap="xs" wrap="wrap">
          <Box style={{ flex: 1 }}>
            <Text>{data.title}</Text>
            <Text size="xs" c="dimmed">
              {data.description}
            </Text>
          </Box>
          {data.optionType === 'group' ? (
            <IconChevronRight size={16} />
          ) : (
            <Box style={{ flexBasis: small && data.optionType.includes("select") ? "100%" : "auto" }}>
              {data.optionType === 'switch' && (
                <Switch
                  onLabel="开"
                  offLabel="关"
                  className={classes.switch}
                  size="lg"
                  checked={(Boolean(value) && value.hasOwnProperty(data.key)) ? value[data.key] : data.defaultValue}
                  onChange={(event) => onChange && onChange(data.key, event.currentTarget.checked)}
                />
              )}
              {data.optionType === 'select' && (
                <Select
                  variant="filled"
                  data={data.options || []}
                  value={(Boolean(value) && value.hasOwnProperty(data.key)) ? value[data.key] : data.defaultValue as string}
                  comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                  onChange={(value) => onChange && onChange(data.key, value)}
                />
              )}
              {data.optionType === 'multi-select' && (
                <MultiSelect
                  variant="filled"
                  data={data.options || []}
                  placeholder={data.placeholder}
                  value={(value !== undefined && value.hasOwnProperty(data.key)) ? value[data.key] : data.defaultValue as string[]}
                  comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                  onChange={(value) => onChange && onChange(data.key, value)}
                />
              )}
              {data.optionType === 'button' && (
                <Button
                  variant="outline"
                  color={data.color || 'blue'}
                  onClick={data.onClick}
                >
                  {data.placeholder}
                </Button>
              )}
            </Box>
          )}
        </Flex>
      </UnstyledButton>
    </>
  );
}

export const SettingList = memo(({ data, value, onChange }: {
  data: SettingProps[];
  value?: any;
  onChange?: (key: string, value: any) => void;
}) => {
  return data.map((item) => (
    <Setting key={item.key} data={item} value={value} onChange={onChange} />
  ));
});