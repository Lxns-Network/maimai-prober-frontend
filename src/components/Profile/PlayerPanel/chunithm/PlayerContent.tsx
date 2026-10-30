import { ChunithmPlayerProps } from "@/types/player";
import {
  Avatar,
  Badge,
  Divider,
  Flex,
  Group,
  Text,
  Image,
  Center,
  NumberFormatter,
  Box,
} from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getChunithmCharacterColor, getRatingGradient } from "@/utils/color.ts";
import { ASSET_URL } from "@/main";
import { TrophyBadge } from "@/components/TrophyBadge.tsx";
import { Collection } from "../EditCollectionModal.tsx";
import { EditAvatarButton } from "@/components/EditAvatarButton.tsx";

/** 只声明名片实际渲染的字段，好友资料卡（无 friend_code / currency）也能直接复用这张名片。 */
type ChunithmPlayerCardFields = Pick<
  ChunithmPlayerProps,
  "name" | "rating" | "level" | "reborn_count" | "character" | "over_power" | "over_power_progress"
> & {
  trophy?: { name: string; color?: string };
  class_emblem?: { base: number; medal: number };
  /** 金币只在本人资料里下发，好友资料没有这两项，缺省时不渲染。 */
  currency?: number;
  total_currency?: number;
};

interface PlayerContentProps {
  player: ChunithmPlayerCardFields;
  onCollectionEdit?: (collectionType: Collection, defaultValue: number) => void;
  editable: boolean;
}

export const ChunithmPlayerContent = ({
  player,
  onCollectionEdit,
  editable,
}: PlayerContentProps) => {
  return (
    <Group wrap="nowrap">
      <EditAvatarButton
        onClick={() => {
          editable && onCollectionEdit && onCollectionEdit("characters", player.character?.id || 0);
        }}
        disabled={!editable}
      >
        <Avatar
          src={`${ASSET_URL}/chunithm/character/${player.character ? player.character.id : 0}.png!webp`}
          size={94}
          p={5}
          radius="md"
          style={{
            backgroundSize: 94,
            backgroundImage: `url(/assets/chunithm/character/${getChunithmCharacterColor(player.character?.level || 0)}.webp)`,
          }}
        >
          <IconPhotoOff />
        </Avatar>
      </EditAvatarButton>
      <Box pr="md">
        <Flex gap="xs" mb={8}>
          {player.trophy && (
            <TrophyBadge name={player.trophy.name} trophyColor={player.trophy.color || "normal"} />
          )}
          <Badge
            variant="gradient"
            gradient={getRatingGradient(player.rating)}
            style={{
              flex: "none",
            }}
          >
            Rating: {player.rating}
          </Badge>
        </Flex>

        <Text fz="lg" fw={500}>
          {player.name}
        </Text>
        <Divider mb={10} variant="dashed" />
        <Group wrap="nowrap" h={40}>
          <Center
            h={28}
            w={28}
            c="dark"
            fz="md"
            fw={500}
            mr={-16}
            style={{
              backgroundSize: "contain",
              backgroundImage: `url(/assets/chunithm/reborn_star.webp)`,
              filter: player.reborn_count ? "none" : "grayscale(100%)",
            }}
          >
            {player.reborn_count}
          </Center>
          <Text mt={8} fz="md">
            Lv.
            <Text span fz="xl" fw={500} ml={4} lh="md">
              {player.level}
            </Text>
          </Text>
          {player.class_emblem && player.class_emblem.base + player.class_emblem.medal !== 0 && (
            <Flex
              align="center"
              justify="center"
              style={{
                position: "relative",
              }}
            >
              {player.class_emblem.base !== 0 && (
                <Image
                  src={`/assets/chunithm/class_emblem/base/${player.class_emblem.base}.webp`}
                  h={24}
                  w="auto"
                />
              )}
              {player.class_emblem.medal !== 0 && (
                <Image
                  src={`/assets/chunithm/class_emblem/medal/${player.class_emblem.medal}.webp`}
                  h={40}
                  w="auto"
                  style={{
                    position: player.class_emblem.base ? "absolute" : "static",
                  }}
                />
              )}
            </Flex>
          )}
          <div>
            <Text fz="xs" c="dimmed">
              Over Power
            </Text>
            <Text fz="sm">
              {(player.over_power || 0).toFixed(2)}
              <Text fz="xs" component="span" ml={4}>
                ({(player.over_power_progress || 0).toFixed(2)}%)
              </Text>
            </Text>
          </div>
          {player.currency !== undefined && (
            <div>
              <Text fz="xs" c="dimmed" lineClamp={1}>
                所持金币
              </Text>
              <Text fz="sm">
                <NumberFormatter value={player.currency} thousandSeparator />
              </Text>
            </div>
          )}
          {player.total_currency !== undefined && (
            <div>
              <Text fz="xs" c="dimmed" lineClamp={1}>
                全部金币
              </Text>
              <Text fz="sm">
                <NumberFormatter value={player.total_currency} thousandSeparator />
              </Text>
            </div>
          )}
        </Group>
      </Box>
    </Group>
  );
};
