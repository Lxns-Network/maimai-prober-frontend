import { Flex, Stack, Text } from "@mantine/core";
import { ChunithmProfileCard, MaimaiProfileCard } from "@/types/friend";
import { Game } from "@/types/game";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { GameAvatar, RatingBadge } from "./FriendCard";

type Profile = MaimaiPlayerProps | ChunithmPlayerProps | MaimaiProfileCard | ChunithmProfileCard;

const formatRatingGap = (game: Game, gap: number) => {
  const magnitude = game === "maimai" ? String(Math.abs(gap)) : Math.abs(gap).toFixed(2);
  return `${gap > 0 ? "+" : gap < 0 ? "-" : "±"}${magnitude}`;
};

const Side = ({
  game,
  profile,
  mirrored,
}: {
  game: Game;
  profile?: Profile;
  mirrored?: boolean;
}) => (
  <Flex
    flex={1}
    miw={0}
    gap="xs"
    align={{ base: mirrored ? "flex-end" : "flex-start", xs: "center" }}
    direction={{ base: "column", xs: mirrored ? "row-reverse" : "row" }}
  >
    <GameAvatar game={game} profile={profile} size={40} radius={0} />
    <Flex
      direction="column"
      gap={4}
      miw={0}
      maw="100%"
      align={mirrored ? "flex-end" : "flex-start"}
    >
      {profile && <RatingBadge game={game} rating={profile.rating} />}
      <Text size="sm" fw={600} lh={1.2} truncate="end" maw="100%" title={profile?.name}>
        {profile?.name ?? "—"}
      </Text>
    </Flex>
  </Flex>
);

/**
 * 「好友 VS」汇总卡顶部的双方信息，左右分别对应下方进度条的两端：左侧为自己，右侧为好友。
 * 中间显示自己相对好友的 Rating 差。
 */
export const FriendVsHeader = ({
  game,
  mine,
  theirs,
}: {
  game: Game;
  mine: MaimaiPlayerProps | ChunithmPlayerProps;
  theirs?: MaimaiProfileCard | ChunithmProfileCard;
}) => {
  const gap =
    theirs &&
    (game === "maimai"
      ? mine.rating - theirs.rating
      : Math.round((mine.rating - theirs.rating) * 100) / 100);

  return (
    <Flex gap="xs" align="center">
      <Side game={game} profile={mine} />
      {gap !== undefined && (
        <Stack gap={4} align="center">
          <Text fz="xs" c="dimmed" lh={1}>
            Rating 差
          </Text>
          <Text fz="sm" fw={700} lh={1} c={gap > 0 ? "teal" : gap < 0 ? "red" : "dimmed"}>
            {formatRatingGap(game, gap)}
          </Text>
        </Stack>
      )}
      <Side game={game} profile={theirs} mirrored />
    </Flex>
  );
};
