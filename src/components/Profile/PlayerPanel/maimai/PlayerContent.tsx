import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import {
  Avatar,
  Badge,
  Divider, Flex,
  Group,
  Image,
  rem,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getDeluxeRatingGradient, getTrophyColor } from "../../../../utils/color.tsx";
import { ASSET_URL } from "../../../../main.tsx";
import { CustomMarquee } from "../../../CustomMarquee.tsx";

export const PlayerContent = ({ player }: { player: MaimaiPlayerProps }) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Group wrap="nowrap">
      <Avatar src={`${ASSET_URL}/maimai/icon/${player.icon ? player.icon.id : 0}.png!webp`} size={94} radius="md" styles={(theme) => ({
        root: {
          backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
        }
      })}>
        <IconPhotoOff />
      </Avatar>
      <div>
        <Flex gap="xs" mb={8}>
          {player.trophy && (
            <Badge variant="light" radius={rem(10)} color={getTrophyColor(player.trophy.color || "normal")} children={
              <CustomMarquee>
                <Text fz="xs" style={{
                  whiteSpace: "pre-wrap"
                }}>
                  {player.trophy.name}
                </Text>
              </CustomMarquee>
            } />
          )}
          <Badge variant="gradient" gradient={getDeluxeRatingGradient(player.rating)} style={{
            flex: "none"
          }}>DX Rating: {player.rating}</Badge>
        </Flex>

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