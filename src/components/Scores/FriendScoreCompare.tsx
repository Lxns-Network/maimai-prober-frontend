import { Badge, Box, Divider, Group, Image, Paper, Text } from "@mantine/core";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { FriendRankingScoreProps } from "@/hooks/queries/useFriendScoreRanking.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { MaimaiSongList, getDifficulty } from "@/utils/api/song/maimai.ts";

interface CompareRow {
  label: string;
  mine: React.ReactNode;
  theirs: React.ReactNode;
  /** 差值文案，只在双方都有值且存在差异时给出。 */
  diff?: string;
}

const formatAchievements = (value?: number) => (value === undefined ? "—" : `${value.toFixed(4)}%`);

const formatCount = (value?: number) => (value === undefined ? "—" : value.toLocaleString());

const musicIconOrDash = (game: Game, value?: string) =>
  value ? (
    <Image src={`/assets/${game}/music_icon/${value}.webp`} h={20} w="auto" />
  ) : (
    <Text fz="sm" c="dimmed">
      —
    </Text>
  );

/**
 * 单谱面的双人对比：数据全部来自双方已有的这张谱面成绩，
 * 不额外请求，也不做任何胜负判定之外的推断。
 */
export const FriendScoreCompare = ({
  game,
  mine,
  theirs,
  theirName,
}: {
  game: Game;
  mine: MaimaiScoreProps | ChunithmScoreProps;
  theirs: FriendRankingScoreProps;
  theirName: string;
}) => {
  const songList = useSongListStore((state) => state[game]);

  let dxScoreMax: number | undefined;
  if (game === "maimai" && songList instanceof MaimaiSongList && "type" in mine) {
    const song = songList.find(mine.id);
    const difficulty = song ? getDifficulty(song, mine.type, mine.level_index) : null;
    // song/list 可能只下发难度元数据；缺少 notes 时仍展示 DX 分数，只是不显示满分。
    if (difficulty?.notes) dxScoreMax = difficulty.notes.total * 3;
  }

  const rows: CompareRow[] = [];

  if (game === "maimai" && "achievements" in mine) {
    const gap =
      theirs.achievements === undefined ? undefined : mine.achievements - theirs.achievements;

    rows.push({
      label: "达成率",
      mine: formatAchievements(mine.achievements),
      theirs: formatAchievements(theirs.achievements),
      diff: gap === undefined || gap === 0 ? undefined : `${gap > 0 ? "+" : ""}${gap.toFixed(4)}%`,
    });

    const dxGap = theirs.dx_score === undefined ? undefined : mine.dx_score - theirs.dx_score;
    rows.push({
      label: dxScoreMax ? `DX 分数（满分 ${dxScoreMax.toLocaleString()}）` : "DX 分数",
      mine: formatCount(mine.dx_score),
      theirs: formatCount(theirs.dx_score),
      diff: dxGap === undefined || dxGap === 0 ? undefined : `${dxGap > 0 ? "+" : ""}${dxGap}`,
    });

    rows.push({
      label: "FULL COMBO",
      mine: musicIconOrDash(game, mine.fc),
      theirs: musicIconOrDash(game, theirs.fc),
    });
    rows.push({
      label: "FULL SYNC",
      mine: musicIconOrDash(game, mine.fs),
      theirs: musicIconOrDash(game, theirs.fs),
    });
  }

  if (game === "chunithm" && "score" in mine) {
    const gap = theirs.score === undefined ? undefined : mine.score - theirs.score;
    rows.push({
      label: "分数",
      mine: formatCount(mine.score),
      theirs: formatCount(theirs.score),
      diff: gap === undefined || gap === 0 ? undefined : `${gap > 0 ? "+" : ""}${gap}`,
    });
    rows.push({
      label: "FULL COMBO",
      mine: musicIconOrDash(game, mine.full_combo),
      theirs: musicIconOrDash(game, theirs.full_combo),
    });
    rows.push({
      label: "FULL CHAIN",
      mine: musicIconOrDash(game, mine.full_chain),
      theirs: musicIconOrDash(game, theirs.full_chain),
    });
  }

  const mainGap =
    game === "maimai" && "achievements" in mine && theirs.achievements !== undefined
      ? mine.achievements - theirs.achievements
      : game === "chunithm" && "score" in mine && theirs.score !== undefined
        ? mine.score - theirs.score
        : undefined;

  const headline =
    mainGap === undefined
      ? "对方在这张谱面上的成绩不完整"
      : mainGap === 0
        ? "双方成绩完全一致"
        : mainGap > 0
          ? `你领先 ${game === "maimai" ? `${mainGap.toFixed(4)}%` : mainGap.toLocaleString()}`
          : `你落后 ${game === "maimai" ? `${Math.abs(mainGap).toFixed(4)}%` : Math.abs(mainGap).toLocaleString()}`;

  return (
    <Paper radius="md" withBorder p="sm" mt={6}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Badge
          variant="light"
          color={mainGap === undefined ? "gray" : mainGap >= 0 ? "teal" : "red"}
        >
          {headline}
        </Badge>
        <Text fz="xs" c="dimmed" lineClamp={1} style={{ wordBreak: "break-word" }}>
          我 vs {theirName}
        </Text>
      </Group>

      <Divider my="xs" variant="dashed" />

      {rows.map((row) => (
        <Group key={row.label} justify="space-between" wrap="nowrap" gap="xs" mb={6}>
          <Text fz="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {row.label}
          </Text>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Box style={{ minWidth: 72, textAlign: "right" }}>
              <Text fz="sm" component="div">
                {row.mine}
              </Text>
            </Box>
            <Text fz="xs" c="dimmed">
              /
            </Text>
            <Box style={{ minWidth: 72 }}>
              <Text fz="sm" component="div">
                {row.theirs}
              </Text>
            </Box>
            {row.diff && (
              <Badge size="xs" variant="light" color={row.diff.startsWith("+") ? "teal" : "red"}>
                {row.diff}
              </Badge>
            )}
          </Group>
        </Group>
      ))}
    </Paper>
  );
};
