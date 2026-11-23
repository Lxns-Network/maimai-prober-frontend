import { Game } from "@/types/game";

export const collectionTypeData: Record<Game, { label: string; value: string }[]> = {
  maimai: [
    { label: "姓名框", value: "plate" },
    { label: "称号", value: "trophy" },
    { label: "头像", value: "icon" },
    { label: "背景", value: "frame" },
  ],
  chunithm: [
    { label: "称号", value: "trophy" },
    { label: "角色", value: "character" },
    { label: "名牌版", value: "plate" },
    { label: "地图头像", value: "icon" },
  ],
};
