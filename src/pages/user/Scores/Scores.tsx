import { Page } from "@/components/Page/Page.tsx";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { ScoreBestsSection } from "./bests/ScoreBestsSection.tsx";
import { ScoreBackupSection } from "./backup/ScoreBackupSection.tsx";
import { ScoreListSection } from "./list/ScoreListSection.tsx";
import { scoresTabs } from "./scoresTabs.ts";

export function Scores() {
  return (
    <Page
      meta={{
        title: "成绩管理",
        description: "管理你的 maimai DX 查分器账号的成绩",
      }}
      maxWidth={1100}
      tabs={withTabContent(scoresTabs, {
        list: <ScoreListSection />,
        bests: <ScoreBestsSection />,
        backup: <ScoreBackupSection />,
      })}
    />
  );
}
