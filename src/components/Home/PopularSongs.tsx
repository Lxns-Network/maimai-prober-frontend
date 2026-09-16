import {
  Avatar,
  Badge,
  Center,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  VisuallyHidden,
} from "@mantine/core";
import { IconCrown, IconPhotoOff, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import clsx from "clsx";
import { Link } from "@/components/Link";
import { ASSET_URL } from "@/main";
import { type PopularSongsData, type PopularSong } from "@/hooks/queries/usePopularSongs";
import { Game } from "@/types/game";
import { getScoreCardBackgroundColor, getTrophyColor } from "@/utils/color";
import classes from "./PopularSongs.module.css";

// 第 1 名用金色渐变（基于站内金称号色加亮）；改这批颜色时需同步
// PopularSongs.module.css 里 rank1/rank2/rank3 行底色的 rgb 常量。
const GOLD_GRADIENT = { from: "#ffbe26", to: "#f59e0b", deg: 135 };

const MEDAL_COLORS: Record<number, string> = {
  2: getTrophyColor("silver"),
  // 站内铜称号色 #F06418 与金色 #FFAB09 色相过近，小徽章上 1、3 名难以区分，这里改用更深的古铜色
  3: "#b87333",
};

const DIFFICULTY_NAMES: Record<Game, string[]> = {
  maimai: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"],
  chunithm: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA", "WORLD'S END"],
};

// 舞萌曲绘按基础曲目 ID 存储（宴会场曲目折回原曲）；中二节奏 WORLD'S END 的曲绘
// 需要曲目资源里的 origin_id，待后端榜单支持中二时一并处理，此处先用原始 ID。
const jacketUrl = (game: Game, songId: number) =>
  `${ASSET_URL}/${game}/jacket/${game === "maimai" ? songId % 10000 : songId}.png!webp`;

function Trend({ delta }: { delta: number | "new" }) {
  if (delta === "new") {
    return (
      <span className={clsx(classes.trend, classes.trendNew)} aria-label="新上榜">
        NEW
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className={clsx(classes.trend, classes.trendFlat)} aria-label="排名较上一周期持平">
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={clsx(classes.trend, up ? classes.trendUp : classes.trendDown)}
      aria-label={`排名较上一周期${up ? "上升" : "下降"} ${Math.abs(delta)} 位`}
    >
      {up ? <IconTrendingUp size={13} aria-hidden /> : <IconTrendingDown size={13} aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
}

function SongDifficultyBadge({ game, song }: { game: Game; song: PopularSong }) {
  const isUtage = game === "maimai" && song.type === "utage";
  const difficultyName = isUtage
    ? "U·TA·GE"
    : (DIFFICULTY_NAMES[game][song.level_index] ?? "MASTER");
  // 宴会场谱面的 level_index 为 0，但调色板下标 5 才是宴会场专用色。
  return (
    <Badge
      variant="filled"
      size="sm"
      radius="sm"
      color={getScoreCardBackgroundColor(game, isUtage ? 5 : song.level_index)}
    >
      <VisuallyHidden>{difficultyName} 难度 </VisuallyHidden>
      {song.level}
    </Badge>
  );
}

function SongRow({ game, song }: { game: Game; song: PopularSong }) {
  const rank = song.rank;
  const delta = song.previous_rank === null ? ("new" as const) : song.previous_rank - rank;
  const isMedal = rank <= 3;
  const medalColor = MEDAL_COLORS[rank];

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
              gradient={GOLD_GRADIENT}
              aria-hidden
            >
              <IconCrown size={13} stroke={2.5} />
            </ThemeIcon>
          ) : isMedal ? (
            <ThemeIcon size={24} radius="md" color={medalColor} fz="xs" fw={800} aria-hidden>
              {rank}
            </ThemeIcon>
          ) : (
            <span className={classes.rankNumber}>{rank}</span>
          )}
          <VisuallyHidden>第 {rank} 名 </VisuallyHidden>
        </Center>

        <Avatar src={jacketUrl(game, song.id)} size={46} radius="md" alt="">
          <IconPhotoOff size={18} />
        </Avatar>

        <Stack gap={2} miw={0}>
          <Text span truncate size="sm" fw={600} lh={1.35} title={song.title}>
            {song.title}
          </Text>
          <Group gap={6} wrap="nowrap" miw={0}>
            <SongDifficultyBadge game={game} song={song} />
            <Text span truncate flex={1} miw={0} size="xs" c="var(--pop-muted)" title={song.artist}>
              {song.artist}
            </Text>
          </Group>
        </Stack>

        <Trend delta={delta} />
      </Link>
    </li>
  );
}

function SkeletonColumn() {
  return (
    <Stack gap={8} miw={0} aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} height={68} radius="md" />
      ))}
    </Stack>
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

  // 展示区块的可见性由页面层控制；异常或空榜时整个 section 不渲染。
  if (!popular || popular.songs.length === 0) return null;

  const leftColumn = popular.songs.slice(0, 5);
  const rightColumn = popular.songs.slice(5, 10);

  return (
    <div className={classes.grid}>
      <ol className={classes.list} aria-label="热门曲目 1 至 5 名">
        {leftColumn.map((song) => (
          <SongRow key={song.id} game={game} song={song} />
        ))}
      </ol>

      {rightColumn.length > 0 && (
        <ol className={classes.list} aria-label="热门曲目 6 至 10 名">
          {rightColumn.map((song) => (
            <SongRow key={song.id} game={game} song={song} />
          ))}
        </ol>
      )}
    </div>
  );
}
