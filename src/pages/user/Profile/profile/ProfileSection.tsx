import { Group, Loader, Stack } from "@mantine/core";
import { PlayerSection } from "@/components/Profile/PlayerSection.tsx";
import { PlayerHeatmapSection } from "@/components/Profile/PlayerHeatmapSection.tsx";
import { UserSection } from "@/components/Profile/UserSection.tsx";
import { YearInReviewSection } from "@/components/Profile/YearInReviewSection.tsx";
import { useUser } from "@/hooks/queries/useUser.ts";

export const ProfileSection = () => {
  const { isLoading } = useUser();

  if (isLoading) {
    return (
      <Group justify="center" mt="xl">
        <Loader />
      </Group>
    )
  }

  return (
    <Stack gap="md">
      <PlayerSection />
      <PlayerHeatmapSection />
      <UserSection />
      <YearInReviewSection />
    </Stack>
  )
}
