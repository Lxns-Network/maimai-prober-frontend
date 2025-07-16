import { Group, Loader, Stack } from '@mantine/core';
import { PlayerSection } from '@/components/Profile/PlayerSection';
import { UserSection } from '@/components/Profile/UserSection';
import { UserBindSection } from '@/components/Profile/UserBindSection';
import { UserTokenSection } from "@/components/Profile/UserTokenSection.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { useUser } from "@/hooks/swr/useUser.ts";
import { PlayerHeatmapSection } from "@/components/Profile/PlayerHeatmapSection.tsx";

const ProfileContent = () => {
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
      <UserBindSection />
      <UserTokenSection />
    </Stack>
  )
}

export default function Profile() {
  return (
    <Page
      meta={{
        title: "账号详情",
        description: "查看你的 maimai DX 查分器账号详情与游戏数据",
      }}
      children={<ProfileContent />}
    />
  )
}