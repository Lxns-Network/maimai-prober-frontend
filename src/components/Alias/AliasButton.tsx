import {
  ActionIcon,
  Center,
  createStyles,
  Flex, Group,
  rem, Space,
  Text, Tooltip,
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiCheck, mdiCreation } from "@mdi/js";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { IconChevronRight } from "@tabler/icons-react";

const useStyles = createStyles((theme) => ({
  alias: {
    display: 'block',
    width: '100%',
    padding: theme.spacing.md,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[0] : theme.black,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
    },
  },
}));

export function AliasButton({ alias, onClick, ...others }: { alias: AliasProps, onClick?: () => void } & UnstyledButtonProps) {
  const { classes } = useStyles();

  return (
    <UnstyledButton className={classes.alias} onClick={onClick} {...others}>
      <Flex>
        <Text fz="sm" c="dimmed" style={{ flex: 1 }} truncate>{alias.song.name}</Text>
        {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
          <Center>
            <Tooltip label="新提交" withinPortal>
              <ActionIcon color="yellow" size="xs" radius="xl" variant="light">
                <Icon path={mdiCreation} size={rem(20)} />
              </ActionIcon>
            </Tooltip>
            {alias.approved && (
              <Space w="xs" />
            )}
          </Center>
        )}
        {alias.approved && (
          <Center>
            <Tooltip label="已批准" withinPortal>
              <ActionIcon color="teal" size="xs" radius="xl" variant="light">
                <Icon path={mdiCheck} size={rem(20)} />
              </ActionIcon>
            </Tooltip>
          </Center>
        )}
      </Flex>
      <Group>
        <Text fz="xl" weight={700} truncate style={{ flex: 1 }}>{alias.alias}</Text>
        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}