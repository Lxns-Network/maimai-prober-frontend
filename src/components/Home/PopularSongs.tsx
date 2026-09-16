import { Avatar, Skeleton, VisuallyHidden } from "@mantine/core";
import { IconCrown, IconPhotoOff, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import clsx from "clsx";
import { Link } from "@/components/Link";
import { ASSET_URL } from "@/main";
import { type PopularSongsData, type PopularSong } from "@/hooks/queries/usePopularSongs";
import { Game } from "@/types/game";
import { getScoreCardBackgroundColor, getTrophyColor } from "@/utils/color";
import classes from "./PopularSongs.module.css";

const MEDAL_COLORS: Record<number, string> = {
  1: getTrophyColor("gold"),
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

function Trend({ delta, className }: { delta: number | "new"; className?: string }) {
  if (delta === "new") {
    return (
      <span className={clsx(classes.trend, classes.trendNew, className)} aria-label="新上榜">
        NEW
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span
        className={clsx(classes.trend, classes.trendFlat, className)}
        aria-label="排名较上一周期持平"
      >
        —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={clsx(classes.trend, up ? classes.trendUp : classes.trendDown, className)}
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
    <span
      className={classes.badge}
      style={{ backgroundColor: getScoreCardBackgroundColor(game, isUtage ? 5 : song.level_index) }}
    >
      <VisuallyHidden>{difficultyName} 难度 </VisuallyHidden>
      {song.level}
    </span>
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
        <div className={classes.rankCol}>
          {rank === 1 ? (
            <span className={clsx(classes.rankBadge, classes.rankBadgeGold)} aria-hidden>
              <IconCrown size={13} stroke={2.5} />
            </span>
          ) : isMedal ? (
            <span className={classes.rankBadge} style={{ backgroundColor: medalColor }} aria-hidden>
              {rank}
            </span>
          ) : (
            <span className={classes.rankNumber}>{rank}</span>
          )}
          <VisuallyHidden>第 {rank} 名 </VisuallyHidden>
        </div>

        <Avatar
          src={jacketUrl(game, song.id)}
          size={46}
          radius="md"
          alt=""
          className={classes.jacket}
        >
          <IconPhotoOff size={18} />
        </Avatar>

        <div className={classes.info}>
          <span className={classes.songTitle} title={song.title}>
            {song.title}
          </span>
          <span className={classes.meta}>
            <SongDifficultyBadge game={game} song={song} />
            <span className={classes.artist} title={song.artist}>
              {song.artist}
            </span>
          </span>
        </div>

        <Trend delta={delta} className={classes.trendBadge} />
      </Link>
    </li>
  );
}

function SkeletonColumn() {
  return (
    <div className={classes.column}>
      <div className={classes.list} aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} height={68} radius="md" />
        ))}
      </div>
    </div>
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
      <div className={classes.column}>
        <ol className={classes.list} aria-label="热门曲目 1 至 5 名">
          {leftColumn.map((song) => (
            <SongRow key={song.id} game={game} song={song} />
          ))}
        </ol>
      </div>

      {rightColumn.length > 0 && (
        <div className={classes.column}>
          <ol className={classes.list} aria-label="热门曲目 6 至 10 名">
            {rightColumn.map((song) => (
              <SongRow key={song.id} game={game} song={song} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
