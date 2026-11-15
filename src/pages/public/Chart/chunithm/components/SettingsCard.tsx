import { useState, type ReactNode } from "react";
import { Card, UnstyledButton, Group, Text, Collapse, Stack } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import classes from "../../../Chart.module.css";

export function SettingsCard({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Card className={classes.card} radius="lg" withBorder>
      <UnstyledButton onClick={() => setOpened((value) => !value)} aria-expanded={opened} w="100%">
        <Group justify="space-between">
          <Group gap="xs">
            {icon}
            <Text size="sm" fw={500}>
              {label}
            </Text>
          </Group>
          <IconChevronDown size={16} style={{ transform: opened ? "rotate(180deg)" : "none" }} />
        </Group>
      </UnstyledButton>
      <Collapse expanded={opened}>
        <Stack gap="md" mt="md">
          {children}
        </Stack>
      </Collapse>
    </Card>
  );
}
