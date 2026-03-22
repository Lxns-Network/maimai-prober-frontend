import { useEffect, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { LoginAlert } from "@/components/LoginAlert";
import { RadioCardGroup } from "@/components/RadioCardGroup.tsx";
import { ScoresChangesModal } from "@/components/Sync/ScoresChangesModal.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { getCrawlStatistic } from "@/utils/api/misc.ts";
import useGame from "@/hooks/useGame.ts";
import { HtmlSyncSection } from "./Sync/HtmlSyncSection";
import { ProxySyncSection } from "./Sync/ProxySyncSection";
import {
  CrawlStatisticProps,
  SyncResultSnapshot,
} from "@/types/sync";

type SyncMethod = "proxy" | "html";

const SyncContent = () => {
  const [crawlStatistic, setCrawlStatistic] = useState<CrawlStatisticProps | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResultSnapshot | null>(null);
  const [resultModalOpened, setResultModalOpened] = useState(false);
  const [syncMethod, setSyncMethod] = useState<SyncMethod>("proxy");
  const [game, setGame] = useGame();

  const isLoggedOut = !localStorage.getItem("token");

  useEffect(() => {
    const getCrawlStatisticHandler = async () => {
      try {
        const res = await getCrawlStatistic(game);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message);
        }
        setCrawlStatistic(data.data);
      } catch (error) {
        console.log(error);
      }
    };

    if (game) getCrawlStatisticHandler();
  }, [game]);

  const activeSyncMethod: SyncMethod = isLoggedOut ? "proxy" : syncMethod;
  const syncMethodOptions = [
    { name: "代理同步", description: "使用 HTTP 代理与微信 OAuth 同步成绩", value: "proxy" },
    ...(!isLoggedOut ? [{
      name: "手动上传 HTML",
      description: "上传成绩页面的 HTML 文件",
      value: "html",
    }] : []),
  ];

  return (
    <div>
      <ScoresChangesModal
        game={syncResult?.game ?? game}
        scores={syncResult?.scores ?? []}
        opened={resultModalOpened}
        onClose={() => setResultModalOpened(false)}
      />
      <Stack gap="xs" mb="xl">
        <Text fz="sm">选择同步方式</Text>
        <RadioCardGroup
          data={syncMethodOptions}
          value={activeSyncMethod}
          onChange={(value) => setSyncMethod(value as SyncMethod)}
        />
      </Stack>
      {activeSyncMethod === "proxy" ? (
        <ProxySyncSection
          crawlStatistic={crawlStatistic}
          game={game}
          onGameChange={(value) => setGame(value)}
          onSyncResult={(result) => {
            setSyncResult(result);
          }}
          onViewSyncResult={(result) => {
            setSyncResult(result);
            setResultModalOpened(true);
          }}
        />
      ) : (
        <HtmlSyncSection
          game={game}
          onGameChange={(value) => setGame(value)}
          onSyncResult={(result) => {
            setSyncResult(result);
            setResultModalOpened(true);
          }}
        />
      )}
      <LoginAlert content="你需要登录查分器账号才能查看数据同步状态，并管理你同步的游戏数据。" mt="xs" radius="md" />
    </div>
  );
};

export default function Sync() {
  return (
    <Page
      meta={{
        title: "同步游戏数据",
        description: "同步你的玩家数据与成绩",
      }}
      children={<SyncContent />}
    />
  );
}
