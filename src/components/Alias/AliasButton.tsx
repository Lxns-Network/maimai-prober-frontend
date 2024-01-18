import {
  Center,
  Flex, Group,
  rem, Space,
  Text, ThemeIcon, Tooltip,
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiCheck, mdiCreation } from "@mdi/js";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { IconChevronRight } from "@tabler/icons-react";
import classes from "./Alias.module.css";

export function AliasButton({ alias, onClick, ...others }: { alias: AliasProps, onClick?: () => void } & UnstyledButtonProps) {
  return (
    <UnstyledButton className={classes.alias} onClick={onClick} {...others}>
      <Flex>
        <Text fz="sm" c="dimmed" style={{ flex: 1 }} truncate>{alias.song.name}</Text>
        {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
          <Center>
            <Tooltip label="新提交" withinPortal>
              <ThemeIcon color="yellow" size="xs" radius="xl" variant="light">
                <Icon path={mdiCreation} size={rem(20)} />
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
                <Icon path={mdiCheck} size={rem(20)} />
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