import { ASSET_URL } from "@/main";
import { type FriendItem } from "@/types/friend";
import { type Game } from "@/types/game";

export const profilePath = (username: string) => `/profile/${encodeURIComponent(username)}`;

export const profileUrl = (username: string) => `${window.location.origin}${profilePath(username)}`;

export type GameAvatarProfile = {
  icon?: { id: number };
  character?: { id: number; level?: number };
};

/** 舞萌 DX 取头像，中二节奏取角色；没有对应收藏品时为 `undefined`。 */
export const gameAvatarSrc = (game: Game, profile?: GameAvatarProfile) =>
  game === "maimai"
    ? profile?.icon && `${ASSET_URL}/maimai/icon/${profile.icon.id}.png!webp`
    : profile?.character && `${ASSET_URL}/chunithm/character/${profile.character.id}.png!webp`;

/** 好友列表与全局搜索共用的匹配字段：用户名、备注，以及当前游戏的玩家名与称号。 */
export const friendSearchFields = (friend: FriendItem, game: Game) => {
  const profile = friend.games[game].profile;
  return [friend.username, friend.remark, profile?.name, profile?.trophy?.name];
};

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
