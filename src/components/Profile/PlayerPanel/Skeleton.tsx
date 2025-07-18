import { Grid, rem, Skeleton } from "@mantine/core";

export const PlayerPanelSkeleton = () => {
  return (
    <Grid p="md" align="center">
      <Grid.Col span="content">
        <Skeleton h={94} w={94} radius="md" />
      </Grid.Col>
      <Grid.Col span={6}>
        <Skeleton h={16} radius={rem(10)} />
        <Skeleton h={28} mt={12} radius="xl" />
        <Skeleton h={8} mt={12} radius="xl" />
        <Skeleton h={8} mt={8} radius="xl" />
        <Skeleton h={8} mt={8} w="70%" radius="xl" />
      </Grid.Col>
      <Grid.Col span={6}>
        <Skeleton h={8} mt={14} radius="xl" />
        <Skeleton h={8} mt={8} radius="xl" />
        <Skeleton h={8} mt={8} radius="xl" />
        <Skeleton h={8} mt={8} w="70%" radius="xl" />
      </Grid.Col>
    </Grid>
  )
}