import { useState } from 'react';
import { MaimaiScoreProps } from '@/components/Scores/maimai/Score.tsx';
import { ChunithmScoreProps } from "@/components/Scores/chunithm/Score.tsx";
import ScoreContext from "@/utils/context.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { ScoreBestsSection } from "@/pages/user/Scores/bests/ScoreBestsSection.tsx";
import { ScoreBackupSection } from "@/pages/user/Scores/backup/ScoreBackupSection.tsx";
import { ScoreListSection } from "@/pages/user/Scores/list/ScoreListSection.tsx";

export function Scores() {
  const [score, setScore] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [createScoreOpened, setCreateScoreOpened] = useState(false);

  return (
    <ScoreContext.Provider value={{ score, setScore, createScoreOpened, setCreateScoreOpened }}>
      <Page
        meta={{
          title: "成绩管理",
          description: "管理你的 maimai DX 查分器账号的成绩",
        }}
        tabs={[
          { id: "list", name: "成绩列表", children: <ScoreListSection /> },
          { id: "bests", name: "分数构成", children: <ScoreBestsSection />},
          { id: "backup", name: "备份成绩", children: <ScoreBackupSection />}
        ]}
      />
    </ScoreContext.Provider>
  );
}