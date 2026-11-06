import { Card, Group, SegmentedControl, Text, ThemeIcon } from "@mantine/core";
import { IconEye } from "@tabler/icons-react";
import { GAME_NAMES } from "@/components/Friends/gameNames";
import profileClasses from "@/components/Profile/Profile.module.css";
import { useUserConfig } from "@/hooks/queries/useUserConfig";
import { useApplyUserConfig } from "@/hooks/useApplyUserConfig";
import { Game } from "@/types/game";

export const ProfileVisibilityCard = ({ game }: { game: Game }) => {
  const { config, isLoading } = useUserConfig(game);
  const applyUserConfig = useApplyUserConfig(game);

  return (
    <Card className={profileClasses.card} withBorder radius="md">
      <Group justify="space-between" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon variant="light" radius="md">
            <IconEye size={18} />
          </ThemeIcon>
          <Text fz="sm" fw={500}>
            「{GAME_NAMES[game]}」资料公开范围
          </Text>
        </Group>
        <SegmentedControl
          ml="auto"
          size="xs"
          disabled={isLoading}
          value={config?.allow_public_profile ? "all" : "friends"}
          onChange={(value) => applyUserConfig("allow_public_profile", value === "all")}
          data={[
            { label: "仅好友", value: "friends" },
            { label: "所有用户", value: "all" },
          ]}
        />
      </Group>
    </Card>
  );
};
