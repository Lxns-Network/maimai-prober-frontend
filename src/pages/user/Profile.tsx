import { Group, Loader, Space } from '@mantine/core';
import { PlayerSection } from '../../components/Profile/PlayerSection';
import { UserSection } from '../../components/Profile/UserSection';
import { UserBindSection } from '../../components/Profile/UserBindSection';
import { UserTokenSection } from "../../components/Profile/UserTokenSection.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { useUser } from "@/hooks/swr/useUser.ts";

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
    <div>
      <PlayerSection />
      <Space h="md" />
      <UserSection />
      <Space h="md" />
      <UserBindSection />
      <Space h="md" />
      <UserTokenSection />
    </div>
  )
}

export default function Profile() {
  return (
    <Page
      meta={{
        title: "账号设置",
        description: "设置你的 maimai DX 查分器账号",
      }}
      children={<ProfileContent />}
    />
  )
}