import { Game } from "@/types/game";

/** 用户名会被 URL 编码；传入 `game` 时以 `?game=` 指定档案页初始展示的游戏，省略则沿用当前游戏。 */
export const profilePath = (username: string, game?: Game) =>
  `/profile/${encodeURIComponent(username)}${game ? `?game=${game}` : ""}`;
