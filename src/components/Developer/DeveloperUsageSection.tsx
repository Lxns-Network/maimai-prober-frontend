import {
  Badge,
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconActivity, IconChartBar, IconClock, IconDatabaseOff } from "@tabler/icons-react";
import { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "mantine-datatable";
import { useDeveloperUsage } from "@/hooks/queries/useDeveloperUsage.ts";
import classes from "@/pages/Page.module.css";

const methodColor = (method: string) =>
  (
    ({ GET: "blue", POST: "teal", PUT: "yellow", PATCH: "orange", DELETE: "red" }) as Record<
      string,
      string
    >
  )[method] ?? "gray";

const StatCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  color: string;
}) => (
  <Card withBorder radius="md" className={classes.card} p="md">
    <Group gap="sm" wrap="nowrap" h="100%">
      <Box c={color}>{icon}</Box>
      <div style={{ minWidth: 0 }}>
        <Text fz="xs" c="dimmed">
          {label}
        </Text>
        <Text fz="lg" fw={700}>
          {value}
        </Text>
      </div>
    </Group>
  </Card>
);

export const DeveloperUsageSection = () => {
  const { usage, isLoading } = useDeveloperUsage();
  const theme = useMantineTheme();
  const computedColorScheme = useComputedColorScheme("light");
  const gridColor = computedColorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[2];
  const barColor = theme.colors[theme.primaryColor]?.[6] ?? theme.colors.blue[6];

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (!usage || usage.overview.total === 0) {
    return (
      <Flex direction="column" align="center" gap="xs" py="xl" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">最近 30 天内没有接口调用记录</Text>
      </Flex>
    );
  }

  const maxCount = usage.endpoints[0]?.count ?? 1;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        <StatCard
          icon={<IconActivity size={24} stroke={1.5} />}
          label="月总调用数"
          value={usage.overview.total.toLocaleString()}
          color="blue"
        />
        <StatCard
          icon={<IconChartBar size={24} stroke={1.5} />}
          label="日均调用"
          value={usage.overview.daily_avg.toFixed(1)}
          color="teal"
        />
        <StatCard
          icon={<IconClock size={24} stroke={1.5} />}
          label="最近活跃"
          value={
            usage.overview.last_active
              ? new Date(usage.overview.last_active).toLocaleDateString()
              : "—"
          }
          color="grape"
        />
      </SimpleGrid>

      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          每日调用趋势
        </Text>
        <Text fz="xs" c="dimmed" mt={3}>
          最近 {usage.window_days} 天开发者 API 的调用次数
        </Text>
        <Divider my="md" color={gridColor} />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={usage.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11 }}
              tickFormatter={(d: string) => d.slice(5)}
              minTickGap={20}
            />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width="auto" />
            <Tooltip
              content={(props) => {
                if (!props.active || !props.payload || props.payload.length < 1) return null;
                const point = props.payload[0].payload as { day: string; count: number };
                return (
                  <Card p="xs" withBorder fz="sm">
                    <Text fz="xs" c="dimmed">
                      {point.day}
                    </Text>
                    <Text fz="sm">{point.count.toLocaleString()} 次调用</Text>
                  </Card>
                );
              }}
            />
            <Bar dataKey="count" fill={barColor} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card withBorder radius="md" className={classes.card} p={0}>
        <Card.Section className={classes.section} m={0}>
          <Text fz="lg" fw={700}>
            调用明细
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            最近 {usage.window_days} 天开发者 API 各接口的调用次数
          </Text>
        </Card.Section>
        <DataTable
          records={usage.endpoints.map((e, i) => ({ id: i, ...e }))}
          columns={[
            {
              accessor: "method",
              title: <Box ml={6}>方法</Box>,
              width: 82,
              render: (r) => (
                <Box ml={6}>
                  <Badge variant="light" color={methodColor(r.method)} size="sm">
                    {r.method}
                  </Badge>
                </Box>
              ),
            },
            {
              accessor: "endpoint",
              title: "接口",
              ellipsis: true,
              render: (r) => (
                <Text fz="sm" ff="monospace">
                  {r.endpoint}
                </Text>
              ),
            },
            {
              accessor: "count",
              title: <Box mr={6}>调用次数</Box>,
              width: 200,
              render: (r) => (
                <Group gap="sm" wrap="nowrap" mr={6}>
                  <Progress
                    value={(r.count / maxCount) * 100}
                    size="sm"
                    color={theme.primaryColor}
                    style={{ flex: 1 }}
                  />
                  <Text fz="sm" w={56} ta="right">
                    {r.count.toLocaleString()}
                  </Text>
                </Group>
              ),
            },
          ]}
        />
      </Card>
    </Stack>
  );
};
