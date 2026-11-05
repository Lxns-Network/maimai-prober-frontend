import { MaimaiPlayerProps } from "@/types/player";
import { Box, Divider, Flex, Group, Image, Text } from "@mantine/core";
import { TrophyBadge } from "@/components/TrophyBadge.tsx";
import { PlayerAvatar, RatingBadge } from "@/components/Profile/PlayerSummary.tsx";

type MaimaiPlayerCardFields = Pick<
  MaimaiPlayerProps,
  "name" | "rating" | "course_rank" | "class_rank" | "star" | "icon"
> & {
  trophy?: { name: string; color?: string };
};

interface PlayerContentProps {
  player: MaimaiPlayerCardFields;
  onAvatarClick?: () => void;
}

export const MaimaiPlayerContent = ({ player, onAvatarClick }: PlayerContentProps) => {
  return (
    <Group wrap="nowrap">
      <PlayerAvatar game="maimai" profile={player} size={94} onAvatarClick={onAvatarClick} />
      <Box pr="md">
        <Flex gap="xs" mb={8}>
          {player.trophy && (
            <TrophyBadge name={player.trophy.name} trophyColor={player.trophy.color || "normal"} />
          )}
          <RatingBadge game="maimai" rating={player.rating} size="md" />
        </Flex>

        <Text fz="lg" fw={500}>
          {player.name}
        </Text>
        <Divider mb={10} variant="dashed" />
        <Group h={40} gap={0} wrap="nowrap">
          <Image
            src={`/assets/maimai/course_rank/${player.course_rank || 0}.webp`}
            h={36}
            w="auto"
          />
          <Box h={40} w={78} style={{ overflow: "hidden" }}>
            <Image src={`/assets/maimai/class_rank/${player.class_rank || 0}.webp`} mt={-5} />
          </Box>
          <Group gap={2} ml="xs" wrap="nowrap">
            <Image src="/assets/maimai/icon_star.webp" h={30} w="auto" />
            <Text>×{player.star}</Text>
          </Group>
        </Group>
      </Box>
    </Group>
  );
};
