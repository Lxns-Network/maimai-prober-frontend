import { ChunithmPlayerProps } from "@/types/player";
import { Avatar, Badge, Divider, Flex, Group, rem, Text, Image, Center, NumberFormatter } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getRatingGradient, getTrophyColor } from "@/utils/color.ts";
import { ASSET_URL } from "@/main.tsx";
import { Marquee } from "@/components/Marquee.tsx";

export const ChunithmPlayerContent = ({ player }: { player: ChunithmPlayerProps }) => {
  let characterColor = "normal";
  if (player.character && player.character.level) {
    if (player.character.level >= 100) {
      characterColor = "holographic";
    } else if (player.character.level >= 50) {
      characterColor = "rainbow";
    } else if (player.character.level >= 25) {
      characterColor = "platina";
    } else if (player.character.level >= 15) {
      characterColor = "gold";
    } else if (player.character.level >= 10) {
      characterColor = "silver";
    } else if (player.character.level >= 5) {
      characterColor = "copper";
    }
  }

  return (
    <Group wrap="nowrap">
      <Avatar src={`${ASSET_URL}/chunithm/character/${player.character ? player.character.id : 0}.png!webp`} size={94} p={5} radius="md" style={{
        backgroundSize: 94,
        backgroundImage: `url(/assets/chunithm/character/${characterColor}.webp)`,
      }}>
        <IconPhotoOff />
      </Avatar>
      <div>
        <Flex gap="xs" mb={8}>
          {player.trophy && (
            <Badge variant="light" radius={rem(10)} color={getTrophyColor(player.trophy.color)} children={
              <Marquee>
                <Text fz="xs" style={{
                  whiteSpace: "pre-wrap"
                }}>
                  {player.trophy.name}
                </Text>
              </Marquee>
            } />
          )}
          <Badge variant="gradient" gradient={getRatingGradient(player.rating)} style={{
            flex: "none"
          }}>Rating: {player.rating}</Badge>
        </Flex>

        <Text fz="lg" fw={500}>
          {player.name}
        </Text>
        <Divider mt={5} mb={10} variant="dashed" />
        <Group wrap="nowrap">
          <Center h={28} w={28} c="dark" fz="md" fw={500} mr={-16} style={{
            backgroundSize: "contain",
            backgroundImage: `url(/assets/chunithm/reborn_star.webp)`,
            filter: player.reborn_count ? "none" : "grayscale(100%)",
          }}>
            {player.reborn_count}
          </Center>
          <Text mt={8} fz="md">
            Lv.
            <Text span fz="xl" fw={500} ml={4} lh="md">
              {player.level}
            </Text>
          </Text>
          {player.class_emblem.base + player.class_emblem.medal !== 0 && (
            <Flex align="center" justify="center" style={{
              position: "relative",
            }}>
              {player.class_emblem.base !== 0 && (
                <Image src={`/assets/chunithm/class_emblem/base/${player.class_emblem.base}.webp`} h={24} w="auto"/>
              )}
              {player.class_emblem.medal !== 0 && (
                <Image src={`/assets/chunithm/class_emblem/medal/${player.class_emblem.medal}.webp`} h={40} w="auto"
                       style={{
                         position: player.class_emblem.base ? "absolute" : "static",
                       }}/>
              )}
            </Flex>
          )}
          <div>
            <Text fz="xs" c="dimmed">Over Power</Text>
            <Text fz="sm">{(player.over_power || 0).toFixed(2)}
              <Text fz="xs" component="span" ml={4}>({(player.over_power_progress || 0).toFixed(2)}%)</Text>
            </Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed" lineClamp={1}>所持金币</Text>
            <Text fz="sm">
              <NumberFormatter value={player.currency || 0} thousandSeparator/>
            </Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed" lineClamp={1}>全部金币</Text>
            <Text fz="sm">
              <NumberFormatter value={player.total_currency || 0} thousandSeparator/>
            </Text>
          </div>
        </Group>
      </div>
    </Group>
  )
}