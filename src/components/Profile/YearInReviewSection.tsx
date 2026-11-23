import { Card, Divider, Group, NavLink, Text } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import classes from "./Profile.module.css";
import { yearInReviewLinks } from "./yearInReviewLinks.ts";

export const YearInReviewSection = () => {
  return (
    <Card withBorder radius="md" className={classes.card}>
      <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            年度总结
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            回顾你每一年的游戏数据
          </Text>
        </div>
      </Group>
      <Card.Section>
        {yearInReviewLinks.map((link, index) => (
          <div key={link.to}>
            {index === 0 && <Divider />}
            <NavLink
              label={link.label}
              leftSection={<link.icon size={16} />}
              rightSection={<IconChevronRight size={14} />}
              onClick={() => navigate(link.to)}
              px="md"
            />
            {index < yearInReviewLinks.length - 1 && <Divider />}
          </div>
        ))}
      </Card.Section>
    </Card>
  );
};
