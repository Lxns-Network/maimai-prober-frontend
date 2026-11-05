import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

/** 舞萌 DX 宴谱。 */
export const isUtage = (type: string) => type === "utage";

/** 中二节奏 WORLD'S END。 */
export const isWorldsEnd = (id: number) => id >= 8000;

/** 舞萌 DX 宴谱与中二节奏 WORLD'S END：没有定数与 Rating。 */
export const isUtageOrWorldsEnd = (score: Pick<AnyScore, "id"> & { type?: string }) =>
  score.type !== undefined ? isUtage(score.type) : isWorldsEnd(score.id);

/** 成绩配色使用的难度档位；宴谱与 WORLD'S END 统一取第 5 档。 */
export const scoreColorIndex = (score: AnyScore) =>
  isUtageOrWorldsEnd(score) ? 5 : score.level_index;
