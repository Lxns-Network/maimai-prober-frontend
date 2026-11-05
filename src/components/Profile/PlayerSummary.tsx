import {
  Avatar,
  type AvatarProps,
  Badge,
  type BadgeProps,
  Box,
  Divider,
  Group,
  Image,
  Text,
} from "@mantine/core";
import { IconPhotoOff, IconUser } from "@tabler/icons-react";
import { type MouseEventHandler } from "react";
import { EditAvatarButton } from "@/components/EditAvatarButton";
import { TrophyBadge } from "@/components/TrophyBadge";
import classes from "@/components/Profile/PlayerSummary.module.css";
import { Game } from "@/types/game";
import { ChunithmProfileCard, MaimaiProfileCard } from "@/types/friend";
import {
  getChunithmCharacterColor,
  getDeluxeRatingGradient,
  getRatingGradient,
} from "@/utils/color";
import { gameAvatarSrc, type GameAvatarProfile } from "@/utils/profile";

type MaimaiSummaryProfile = Pick<
  MaimaiProfileCard,
  "name" | "rating" | "course_rank" | "class_rank" | "star"
> & { trophy?: { name: string; color?: string }; icon?: { id: number } };

type ChunithmSummaryProfile = Pick<
  ChunithmProfileCard,
  "name" | "rating" | "level" | "reborn_count" | "over_power"
> & { trophy?: { name: string; color?: string }; character?: { id: number; level?: number } };

const TrophyLine = ({ trophy }: { trophy?: { name: string; color?: string } }) => {
  if (!trophy?.name) return null;
  return <TrophyBadge name={trophy.name} trophyColor={trophy.color ?? "normal"} miw={0} />;
};

export const GameAvatar = ({
  game,
  profile,
  size = 64,
  ...avatarProps
}: {
  game: Game;
  profile?: GameAvatarProfile;
  size?: number;
  component?: "a";
  href?: string;
  "aria-label"?: string;
  "data-vike"?: "false";
  onClick?: MouseEventHandler<HTMLAnchorElement>;
} & Omit<AvatarProps, "src" | "size">) => {
  const character = profile?.character;
  const src = gameAvatarSrc(game, profile);
  const placeholderSize = Math.round(size * 0.375);

  return (
    <Avatar
      src={src}
      size={size}
      radius="md"
      p={game === "chunithm" && character ? Math.round(size / 20) : undefined}
      className={classes.avatar}
      style={
        game === "chunithm" && character
          ? {
              backgroundImage: `url(/assets/chunithm/character/${getChunithmCharacterColor(character.level || 0)}.webp)`,
              backgroundSize: "cover",
            }
          : undefined
      }
      {...avatarProps}
    >
      {src ? <IconPhotoOff size={placeholderSize} /> : <IconUser size={placeholderSize} />}
    </Avatar>
  );
};

export const RatingBadge = ({
  game,
  rating,
  size = "sm",
}: {
  game: Game;
  rating: number;
  size?: BadgeProps["size"];
}) => (
  <Badge
    variant="gradient"
    gradient={game === "maimai" ? getDeluxeRatingGradient(rating) : getRatingGradient(rating)}
    size={size}
    style={{ flexShrink: 0 }}
  >
    {game === "maimai" ? `DX ${rating}` : `Rating ${rating.toFixed(2)}`}
  </Badge>
);

export const PlayerAvatar = ({
  game,
  profile,
  size,
  onAvatarClick,
}: {
  game: Game;
  profile: GameAvatarProfile;
  size?: number;
  onAvatarClick?: () => void;
}) => {
  const avatar = <GameAvatar game={game} profile={profile} size={size} />;
  if (!onAvatarClick) return avatar;
  return (
    <EditAvatarButton onClick={onAvatarClick} radius="md">
      {avatar}
    </EditAvatarButton>
  );
};

export const MaimaiSummary = ({
  profile,
  onAvatarClick,
}: {
  profile: MaimaiSummaryProfile;
  onAvatarClick?: () => void;
}) => (
  <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
    <PlayerAvatar game="maimai" profile={profile} onAvatarClick={onAvatarClick} />
    <Box className={classes.cardGameDetails}>
      <Group gap={6} wrap="nowrap">
        <TrophyLine trophy={profile.trophy} />
        <RatingBadge game="maimai" rating={profile.rating} />
      </Group>
      <Text size="sm" fw={500} truncate="end" title={profile.name} miw={0} mt={4}>
        {profile.name}
      </Text>
      <Divider my={6} variant="dashed" />
      <Group gap={4} wrap="nowrap">
        <Image
          src={`/assets/maimai/course_rank/${profile.course_rank || 0}.webp`}
          alt=""
          h={22}
          w="auto"
          fallbackSrc="/assets/maimai/course_rank/0.webp"
        />
        <Box h={22} w={44} style={{ overflow: "hidden" }}>
          <Image src={`/assets/maimai/class_rank/${profile.class_rank || 0}.webp`} alt="" mt={-3} />
        </Box>
        <Group gap={1} wrap="nowrap" ml={2}>
          <Image src="/assets/maimai/icon_star.webp" alt="" h={18} w="auto" />
          <Text size="xs" fw={600}>
            ×{profile.star}
          </Text>
        </Group>
      </Group>
    </Box>
  </Group>
);

export const ChunithmSummary = ({
  profile,
  onAvatarClick,
}: {
  profile: ChunithmSummaryProfile;
  onAvatarClick?: () => void;
}) => (
  <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
    <PlayerAvatar game="chunithm" profile={profile} onAvatarClick={onAvatarClick} />
    <Box className={classes.cardGameDetails}>
      <Group gap={6} wrap="nowrap">
        <TrophyLine trophy={profile.trophy} />
        <RatingBadge game="chunithm" rating={profile.rating} />
      </Group>
      <Text size="sm" fw={500} truncate="end" title={profile.name} miw={0} mt={4}>
        {profile.name}
      </Text>
      <Divider my={6} variant="dashed" />
      <Group gap="xs">
        <Text size="xs" c="dimmed">
          Lv.{profile.level} (转生 {profile.reborn_count})
        </Text>
        <Text size="xs" c="dimmed">
          OP {profile.over_power.toFixed(1)}
        </Text>
      </Group>
    </Box>
  </Group>
);
