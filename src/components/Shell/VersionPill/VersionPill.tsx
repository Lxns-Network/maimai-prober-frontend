import { Divider, Group, Paper, Text } from "@mantine/core";
import { IconGitCommit, IconTag } from "@tabler/icons-react";
import classes from "./VersionPill.module.css";
import React from "react";

const REPO_URL = "https://github.com/Lxns-Network/maimai-prober-frontend";
const RELEASE_URL = `${REPO_URL}/releases/tag/${__BUILD_VERSION__}`;
const COMMIT_URL = `${REPO_URL}/commit/${__BUILD_COMMIT__}`;

interface VersionPillProps {
  style?: React.CSSProperties;
}

export const VersionPill = ({ style }: VersionPillProps) => {
  return (
    <Paper
      className={classes.pill}
      shadow="md"
      withBorder
      radius="xl"
      px="md"
      py={8}
      style={style}
    >
      <Group gap="xs" wrap="nowrap">
        <a className={classes.link} href={RELEASE_URL} target="_blank" rel="noreferrer">
          <Group gap={4} wrap="nowrap">
            <IconTag size={14} stroke={1.5} />
            <Text size="xs" c="inherit" lh={1}>
              {__BUILD_VERSION__}
            </Text>
          </Group>
        </a>
        <Divider orientation="vertical" />
        <a className={classes.link} href={COMMIT_URL} target="_blank" rel="noreferrer">
          <Group gap={4} wrap="nowrap">
            <IconGitCommit size={14} stroke={1.5} className={classes.commitIcon} />
            <Text size="xs" c="inherit" ff="monospace" lh={1}>
              {__BUILD_COMMIT__}
            </Text>
          </Group>
        </a>
      </Group>
    </Paper>
  );
};
