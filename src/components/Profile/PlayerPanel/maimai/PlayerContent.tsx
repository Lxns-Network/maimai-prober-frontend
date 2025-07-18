import { MaimaiPlayerProps } from "@/types/player";
import { Avatar, Badge, Box, Divider, Flex, Group, Image, rem, Text, useComputedColorScheme } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getDeluxeRatingGradient, getTrophyColor } from "@/utils/color.ts";
import { ASSET_URL } from "@/main.tsx";
import { Marquee } from "@/components/Marquee.tsx";
import { EditAvatarButton } from "../PlayerModal.tsx";
import { Collection } from "../EditCollectionModal.tsx";

interface PlayerContentProps {
  player: MaimaiPlayerProps;
  onCollectionEdit?: (collectionType: Collection, defaultValue: number) => void;
  editable: boolean;
}

export const MaimaiPlayerContent = ({ player, onCollectionEdit, editable }: PlayerContentProps) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Group wrap="nowrap">
      <EditAvatarButton onClick={() => {
        editable && onCollectionEdit && onCollectionEdit("icons", player.icon?.id || 0)
      }} disabled={!editable}>
        <Avatar src={`${ASSET_URL}/maimai/icon/${player.icon ? player.icon.id : 0}.png!webp`} size={94} radius="md" styles={(theme) => ({
          root: {
            backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
          }
        })}>
          <IconPhotoOff />
        </Avatar>
      </EditAvatarButton>
      <Box pr="md">
        <Flex gap="xs" mb={8}>
          {player.trophy && (
            <Badge variant="light" radius={rem(10)} color={getTrophyColor(player.trophy.color || "normal")} children={
              <Marquee>
                <Text fz="xs" style={{
                  whiteSpace: "pre-wrap"
                }}>
                  {player.trophy.name}
                </Text>
              </Marquee>
            } />
          )}
          <Badge variant="gradient" gradient={getDeluxeRatingGradient(player.rating)} style={{
            flex: "none"
          }}>DX 评分: {player.rating}</Badge>
        </Flex>

        <Text fz="lg" fw={500}>
          {player.name}
        </Text>
        <Divider mb={10} variant="dashed" />
        <Group h={40} gap={0} wrap="nowrap">
          <Image src={`/assets/maimai/course_rank/${player.course_rank || 0}.webp`} h={36} w="auto" />
          <Box h={40} w={78} style={{ overflow: "hidden" }}>
            <Image src={`/assets/maimai/class_rank/${player.class_rank || 0}.webp`} mt={-5} />
          </Box>
          <Group gap={2} ml="xs" wrap="nowrap">
            <Image src="/assets/maimai/icon_star.webp" h={30} w="auto" />
            <Text>
              ×{player.star}
            </Text>
          </Group>
        </Group>
      </Box>
    </Group>
  )
}