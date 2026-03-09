import { Card, Divider, Group, NavLink, Text } from "@mantine/core";
import { IconCalendarStats, IconChevronRight } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import classes from "./Profile.module.css";
import { SUPPORTED_YEARS } from "@/pages/(csr)/year-in-review/config";

export const YearInReviewSection = () => {
  const years = [...SUPPORTED_YEARS].sort((a, b) => b - a);

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
        {years.map((year, index) => (
          <div key={year}>
            {index === 0 && <Divider />}
            <NavLink
              label={`${year} 年度总结`}
              leftSection={<IconCalendarStats size={16} />}
              rightSection={<IconChevronRight size={14} />}
              onClick={() => navigate(`/year-in-review/${year}`)}
              px="md"
            />
            {index < years.length - 1 && <Divider />}
          </div>
        ))}
      </Card.Section>
    </Card>
  );
};
