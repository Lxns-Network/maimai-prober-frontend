import { Group, Loader, Stack } from "@mantine/core";
import { UserBindSection } from "@/components/Profile/UserBindSection.tsx";
import { UserTokenSection } from "@/components/Profile/UserTokenSection.tsx";
import { UserOAuthSection } from "@/components/Profile/UserOAuthSection.tsx";
import { useUser } from "@/hooks/swr/useUser.ts";

export const ProfileThirdPartySection = () => {
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
      <UserOAuthSection />
      <UserBindSection />
      <UserTokenSection />
    </Stack>
  )
}