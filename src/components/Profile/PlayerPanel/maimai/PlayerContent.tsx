import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import {
  Avatar,
  Badge,
  Divider,
  Group,
  Image,
  rem,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getDeluxeRatingGradient, getTrophyColor } from "../../../../utils/color.tsx";

export const PlayerContent = ({ player }: { player: MaimaiPlayerProps }) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Group wrap="nowrap">
      <Avatar src={player.icon_url} size={94} radius="md" styles={(theme) => ({
        root: {
          backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
        }
      })}>
        <IconPhotoOff />
      </Avatar>
      <div>
        <Group gap="xs" mb={8}>
          <Badge variant="light" radius={rem(10)} color={getTrophyColor((player.trophy && player.trophy.color) || "normal")} style={{
            height: "auto",
          }} children={
            <Text fz="xs" style={{
              whiteSpace: "pre-wrap"
            }}>
              {player.trophy && player.trophy.name}
            </Text>
          } />
          <Badge variant="gradient" gradient={getDeluxeRatingGradient(player.rating)}>DX Rating: {player.rating}</Badge>
        </Group>
        <Text fz="lg" fw={500}>
          {player.name}
        </Text>
        <Divider mt={5} mb={5} variant="dashed" />
        <Group gap={0} wrap="nowrap">
          <Image src={`/assets/maimai/course_rank/${player.course_rank || 0}.webp`} h={36} w="auto" />
          <Image src={`/assets/maimai/class_rank/${player.class_rank || 0}.webp`} h={46} mt={-2} w="auto" />
          <Group gap={2} ml="xs" wrap="nowrap">
            <Image src="/assets/maimai/icon_star.webp" h={30} w="auto" />
            <Text>
              ×{player.star}
            </Text>
          </Group>
        </Group>
      </div>
    </Group>
  )
}