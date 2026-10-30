import { Game } from "@/types/game";

/** 用户名会被 URL 编码；传入 `game` 时以 `?game=` 指定档案页初始展示的游戏，省略则沿用当前游戏。 */
export const profilePath = (username: string, game?: Game) =>
  `/profile/${encodeURIComponent(username)}${game ? `?game=${game}` : ""}`;

export const myProfilePath = (game: Game) => `/friends?tab=profile&game=${game}`;

/** 可直接分享的完整好友链接，对方打开后能在档案页向该用户发送好友申请。 */
export const profileUrl = (username: string) => `${window.location.origin}${profilePath(username)}`;

/**
 * 从用户输入中取出用户名：接受纯用户名，也接受粘贴进来的好友链接（任意域名的 `/profile/<用户名>`）。
 * 无法解码的链接按原文返回，交给后续校验报错。
 */
export const parseUsernameInput = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/\/profile\/([^/?#\s]+)/);
  if (!match) return trimmed;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return trimmed;
  }
};
