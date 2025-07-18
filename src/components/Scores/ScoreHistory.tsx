import { MaimaiScoreHistory } from "./maimai/ScoreHistory.tsx";
import { ChunithmScoreHistory } from "./chunithm/ScoreHistory.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { Center, Flex, Loader, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { fetchAPI } from "@/utils/api/api.ts";
import { openRetryModal } from "@/utils/modal.tsx";

export const rankData = {
  maimai: {
    "SSS+": 100.5,
    "SSS": 100,
    "SS+": 99.5,
    "SS": 99,
    "S+": 98,
    "S": 97,
    "AAA": 94,
    "AA": 90,
    "A": 80,
  },
  chunithm: {
    "SSS+": 1009000,
    "SSS": 1007500,
    "SS+": 1005000,
    "SS": 1000000,
    "S+": 990000,
    "S": 975000,
    "AAA": 950000,
    "AA": 925000,
    "A": 900000,
  }
};

export const ScoreHistory = ({ game, score, minRank }: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  minRank: string;
}) => {
  const [historyScores, setHistoryScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const isLoggedOut = !localStorage.getItem("token");

  const getPlayerScoreHistory = async (score: MaimaiScoreProps | ChunithmScoreProps) => {
    if ((game === "maimai" && "achievements" in score && score.achievements < 0) ||
      (game === "chunithm" && "score" in score && score.score < 0)) {
      setHistoryScores([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const params = new URLSearchParams({
        song_id: `${score.id}`,
        level_index: `${score.level_index}`,
      });
      if (game === "maimai" && "achievements" in score) {
        params.append("song_type", `${score.type}`);
      }
      const res = await fetchAPI(`user/${game}/player/score/history?${params.toString()}`, {
        method: "GET",
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data) {
        setHistoryScores(data.data.sort((a: MaimaiScoreProps | ChunithmScoreProps, b: MaimaiScoreProps | ChunithmScoreProps) => {
          const uploadTimeDiff = new Date(a.upload_time).getTime() - new Date(b.upload_time).getTime();

          if (uploadTimeDiff === 0 && a.play_time && b.play_time) {
            return new Date(a.play_time).getTime() - new Date(b.play_time).getTime();
          }

          return uploadTimeDiff;
        }));
      }
    } catch (error) {
      openRetryModal("历史记录获取失败", `${error}`, () => getPlayerScoreHistory(score))
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!score) return;

    setHistoryScores([]);
    if (!isLoggedOut) getPlayerScoreHistory(score);
  }, [score]);

  if (isLoggedOut) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">请登录后查看历史记录</Text>
      </Flex>
    );
  }

  if (!score || fetching) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <>
      {(game === "maimai" ?
        <MaimaiScoreHistory
          scores={historyScores as MaimaiScoreProps[]}
          minAchievements={rankData.maimai[minRank as keyof typeof rankData.maimai]}
        /> :
        <ChunithmScoreHistory
          scores={historyScores as ChunithmScoreProps[]}
          minScore={rankData.chunithm[minRank as keyof typeof rankData.chunithm]}
        />
      )}
    </>
  )
}