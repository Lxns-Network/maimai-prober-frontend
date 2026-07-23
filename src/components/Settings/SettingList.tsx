import {
  Switch,
  Text,
  Select,
  MultiSelect,
  Button,
  Box,
  UnstyledButton,
  Flex,
} from "@mantine/core";
import { memo, useId, useState } from "react";
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
  optionType: "switch" | "select" | "multi-select" | "button" | "group" | "custom";
  placeholder?: string;
  color?: string; // 选项类型为 'button' 时需要
  defaultValue?: string | boolean | string[]; // string[] 选项类型为 'multi-select' 时需要
  settings?: SettingProps[]; // 选项类型为 'group' 时需要
  options?: OptionProps[]; // 选项类型为 'select' 或 'multi-select' 时需要
  onChange?: (value: string | boolean | string[] | null) => void; // 选项更改时的回调函数
  onClick?: () => void; // 选项类型为 'button' 时需要
  render?: () => React.ReactNode; // 选项类型为 'custom' 时需要
}

export type SettingValue = Record<string, unknown>;
type SettingOnChange = (key: string, value: string | boolean | string[] | null) => void;

const Setting = ({
  data,
  value,
  onChange,
}: {
  data: SettingProps;
  value?: SettingValue;
  onChange?: SettingOnChange;
}) => {
  const [opened, setOpened] = useState(false);
  const small = useMediaQuery("(max-width: 450px)");
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  const settingContent = (
    <>
      <Flex justify="space-between" align="center" columnGap="md" rowGap="xs" wrap="wrap">
        <Box style={{ flex: 1 }}>
          <Text id={titleId}>{data.title}</Text>
          <Text id={descriptionId} size="xs" c="dimmed">
            {data.description}
          </Text>
        </Box>
        {data.optionType === "group" ? (
          <IconChevronRight size={16} aria-hidden="true" />
        ) : (
          data.optionType !== "custom" && (
            <Box
              style={{ flexBasis: small && data.optionType.includes("select") ? "100%" : "auto" }}
            >
              {data.optionType === "switch" && (
                <Switch
                  onLabel="开"
                  offLabel="关"
                  className={classes.switch}
                  size="lg"
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  checked={
                    value && data.key in value
                      ? (value[data.key] as boolean)
                      : (data.defaultValue as boolean)
                  }
                  onChange={(event) => onChange && onChange(data.key, event.currentTarget.checked)}
                />
              )}
              {data.optionType === "select" && (
                <Select
                  variant="filled"
                  data={data.options || []}
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  value={
                    value && data.key in value
                      ? (value[data.key] as string)
                      : (data.defaultValue as string)
                  }
                  comboboxProps={{
                    transitionProps: {
                      transition: "fade",
                      duration: 100,
                      timingFunction: "ease",
                    },
                  }}
                  onChange={(value) => onChange && onChange(data.key, value)}
                />
              )}
              {data.optionType === "multi-select" && (
                <MultiSelect
                  variant="filled"
                  data={data.options || []}
                  placeholder={data.placeholder}
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  value={
                    value && data.key in value
                      ? (value[data.key] as string[])
                      : (data.defaultValue as string[])
                  }
                  comboboxProps={{
                    transitionProps: {
                      transition: "fade",
                      duration: 100,
                      timingFunction: "ease",
                    },
                  }}
                  onChange={(value) => onChange && onChange(data.key, value)}
                />
              )}
              {data.optionType === "button" && (
                <Button
                  variant="outline"
                  color={data.color}
                  aria-describedby={descriptionId}
                  onClick={data.onClick}
                >
                  {data.placeholder}
                </Button>
              )}
            </Box>
          )
        )}
      </Flex>
      {data.optionType === "custom" && data.render && <Box mt="xs">{data.render()}</Box>}
    </>
  );

  return (
    <>
      <SettingsModal
        title={data.title}
        data={data.settings || []}
        value={value}
        opened={opened}
        onClose={() => setOpened(false)}
        onChange={onChange}
      />
      {data.optionType === "group" ? (
        <UnstyledButton
          w="100%"
          className={classes.item}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-expanded={opened}
          aria-haspopup="dialog"
          onClick={() => setOpened(true)}
        >
          {settingContent}
        </UnstyledButton>
      ) : (
        <Box className={classes.item}>{settingContent}</Box>
      )}
    </>
  );
};

export const SettingList = memo(
  ({
    data,
    value,
    onChange,
  }: {
    data: SettingProps[];
    value?: SettingValue;
    onChange?: SettingOnChange;
  }) => {
    return (
      <Box>
        {data.map((item) => (
          <Setting key={item.key} data={item} value={value} onChange={onChange} />
        ))}
      </Box>
    );
  },
);
