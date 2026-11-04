import { Stack } from "@mantine/core";
import { PlayerSection } from "@/components/Profile/PlayerSection.tsx";
import { PlayerHeatmapSection } from "@/components/Profile/PlayerHeatmapSection.tsx";
import { YearInReviewSection } from "@/components/Profile/YearInReviewSection.tsx";

export const ProfileSection = () => (
  <Stack gap="md">
    <PlayerSection />
    <PlayerHeatmapSection />
    <YearInReviewSection />
  </Stack>
);
