import {
  Avatar,
  Badge,
  Center,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconCrown, IconPhotoOff, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import clsx from "clsx";
import { Link } from "@/components/Link";
import { ASSET_URL } from "@/main";
import { type PopularSongsData, type PopularSong } from "@/hooks/queries/usePopularSongs";
import { Game } from "@/types/game";
import { getScoreCardBackgroundColor, getTrophyColor } from "@/utils/color";
import classes from "./PopularSongs.module.css";
import useSongListStore from "@/hooks/useSongListStore";
import { useShallow } from "zustand/react/shallow";

function Trend({ delta }: { delta: number | "new" }) {
  if (delta === "new") {
    return (
      <span className={clsx(classes.trend, classes.trendNew)}>
        NEW
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className={clsx(classes.trend, classes.trendFlat)}>
        —
      </span>
    );
  }
  const up = delta > 0;

  return (
    <span className={clsx(classes.trend, up ? classes.trendUp : classes.trendDown)}>
      {up ? <IconTrendingUp size={13} /> : <IconTrendingDown size={13} />}
      {Math.abs(delta)}
    </span>
  );
}

function SongRow({ game, song }: { game: Game; song: PopularSong }) {
  const { songList } = useSongListStore(useShallow((state) => ({ songList: state[game] })));

  const rank = song.rank;
  const delta = song.previous_rank === null ? ("new" as const) : song.previous_rank - rank;
  const isMedal = rank <= 3;
  const medalColor = {
    2: getTrophyColor("silver"),
    3: "#b87333",
  }[rank];
  const isUtage = game === "maimai" && song.type === "utage";

  return (
    <li className={classes.item}>
      <Link
        to={`/songs?game=${game}&song_id=${song.id}`}
        className={clsx(
          classes.itemLink,
          rank === 1 && classes.rank1,
          rank === 2 && classes.rank2,
          rank === 3 && classes.rank3,
        )}
      >
        <Center>
          {rank === 1 ? (
            <ThemeIcon
              size={24}
              radius="md"
              variant="gradient"
              gradient={{ from: "#ffbe26", to: "#f59e0b", deg: 135 }}
            >
              <IconCrown size={13} stroke={2.5} />
            </ThemeIcon>
          ) : isMedal ? (
            <ThemeIcon size={24} radius="md" color={medalColor} variant="light" fz="xs" fw={800}>
              {rank}
            </ThemeIcon>
          ) : (
            <span className={classes.rankNumber}>{rank}</span>
          )}
        </Center>

        <Avatar
          src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song ? song.id : 0)}.png!webp`}
          size={46}
          radius="md"
        >
          <IconPhotoOff size={18} />
        </Avatar>

        <Stack gap={2} miw={0}>
          <Text span truncate size="sm" fw={600} lh={1.35}>
            {song.title}
          </Text>
          <Group gap={6} wrap="nowrap" miw={0}>
            <Badge
              variant="filled"
              size="sm"
              radius="sm"
              color={getScoreCardBackgroundColor(game, isUtage ? 5 : song.level_index)}
              px={6}
            >
              {song.level}
            </Badge>
            <Text span truncate flex={1} miw={0} size="xs" c="var(--pop-muted)">
              {song.artist}
            </Text>
          </Group>
        </Stack>

        <Trend delta={delta} />
      </Link>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className={classes.item}>
      <div className={classes.itemLink}>
        <Center>
          <Skeleton height={24} width={24} radius="md" />
        </Center>
        <Skeleton height={46} width={46} radius="md" />
        <Stack gap={2} miw={0}>
          <Skeleton height={13} width="70%" radius="sm" />
          <Skeleton height={18} width="45%" radius="sm" />
        </Stack>
        <Skeleton height={14} width={22} radius="sm" />
      </div>
    </li>
  );
}

function SkeletonColumn() {
  return (
    <ul className={classes.list}>
      {Array.from({ length: 5 }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </ul>
  );
}

export function PopularSongs({
  game,
  popular,
  isPending,
}: {
  game: Game;
  popular: PopularSongsData | undefined;
  isPending: boolean;
}) {
  if (isPending) {
    return (
      <div className={classes.grid}>
        <SkeletonColumn />
        <SkeletonColumn />
      </div>
    );
  }

  if (!popular || popular.songs.length === 0) return null;

  const leftColumn = popular.songs.slice(0, 5);
  const rightColumn = popular.songs.slice(5, 10);

  return (
    <div className={classes.grid}>
      <ol className={classes.list}>
        {leftColumn.map((song) => (
          <SongRow key={song.id} game={game} song={song} />
        ))}
      </ol>

      {rightColumn.length > 0 && (
        <ol className={classes.list}>
          {rightColumn.map((song) => (
            <SongRow key={song.id} game={game} song={song} />
          ))}
        </ol>
      )}
    </div>
  );
}
