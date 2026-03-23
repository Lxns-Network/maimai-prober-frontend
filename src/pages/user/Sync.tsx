import { LoginAlert } from "@/components/LoginAlert";
import { Page } from "@/components/Page/Page.tsx";
import { Game } from "@/types/game";
import { HtmlSyncSection } from "./Sync/HtmlSyncSection";
import { ProxySyncSection } from "./Sync/ProxySyncSection";

export interface ScoreChangeDetailProps {
  new: unknown;
  old: unknown;
}

export interface ScoreChangesProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  type: string;
  achievements: ScoreChangeDetailProps;
  dx_rating: ScoreChangeDetailProps;
  dx_score: ScoreChangeDetailProps;
  fc: ScoreChangeDetailProps;
  fs: ScoreChangeDetailProps;
  score: ScoreChangeDetailProps;
  rating: ScoreChangeDetailProps;
  over_power: ScoreChangeDetailProps;
  full_combo: ScoreChangeDetailProps;
  full_chain: ScoreChangeDetailProps;
}

export interface SyncResult {
  game: Game;
  scores: ScoreChangesProps[];
}

export default function Sync() {
  const isLoggedOut = !localStorage.getItem("token");

  return (
    <Page
      meta={{
        title: "同步游戏数据",
        description: "同步你的玩家数据与成绩",
      }}
      tabs={[
        {
          id: "proxy",
          name: "代理同步",
          children: (
            <div>
              <ProxySyncSection />
              <LoginAlert content="你需要登录查分器账号才能查看数据同步状态，并管理你同步的游戏数据。" mt="xs" radius="md" />
            </div>
          ),
        },
        ...(!isLoggedOut ? [{
          id: "html",
          name: "上传 HTML",
          children: <HtmlSyncSection />,
        }] : []),
      ]}
    />
  );
}
