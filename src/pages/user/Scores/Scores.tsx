import { useState } from 'react';
import ScoreContext from "@/utils/context.ts";
import { Page } from "@/components/Page/Page.tsx";
import { ScoreBestsSection } from "./bests/ScoreBestsSection.tsx";
import { ScoreBackupSection } from "./backup/ScoreBackupSection.tsx";
import { ScoreListSection } from "./list/ScoreListSection.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

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