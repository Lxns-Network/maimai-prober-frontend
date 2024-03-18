import {
  Center,
  Flex, Group,
  Space,
  Text, ThemeIcon, Tooltip,
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { IconCheck, IconChevronRight, IconNorthStar } from "@tabler/icons-react";
import classes from "./Alias.module.css";

export function AliasButton({ alias, onClick, ...others }: { alias: AliasProps, onClick?: () => void } & UnstyledButtonProps) {
  return (
    <UnstyledButton className={classes.alias} onClick={onClick} {...others}>
      <Flex>
        <Text fz="sm" c="dimmed" style={{ flex: 1 }} truncate>{alias.song.name || "未知"}</Text>
        {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
          <Center>
            <Tooltip label="新提交" withinPortal>
              <ThemeIcon color="yellow" size="xs" radius="xl" variant="light">
                <IconNorthStar />
              </ThemeIcon>
            </Tooltip>
            {alias.approved && (
              <Space w="xs" />
            )}
          </Center>
        )}
        {alias.approved && (
          <Center>
            <Tooltip label="已批准" withinPortal>
              <ThemeIcon variant="light" color="teal" size="xs" radius="xl">
                <IconCheck />
              </ThemeIcon>
            </Tooltip>
          </Center>
        )}
      </Flex>
      <Group>
        <Text fz="xl" fw={700} truncate style={{ flex: 1 }}>{alias.alias}</Text>
        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}