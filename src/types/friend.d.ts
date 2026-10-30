/** 未授权查看基本资料时只返回 private，不透露游戏绑定状态。 */
export type FriendGameState = "visible" | "unbound" | "unavailable" | "private";

export interface CollectionCard {
  id: number;
  name: string;
  genre?: string;
  color?: string;
  level?: number;
}

export interface MaimaiProfileCard {
  name: string;
  rating: number;
  course_rank: number;
  class_rank: number;
  star: number;
  trophy?: CollectionCard;
  icon?: CollectionCard;
  upload_time?: string;
}

export interface ClassEmblemCard {
  base: number;
  medal: number;
}

export interface ChunithmProfileCard {
  name: string;
  rating: number;
  rating_possession: string;
  level: number;
  reborn_count: number;
  class_emblem?: ClassEmblemCard;
  over_power: number;
  over_power_progress: number;
  trophy?: CollectionCard;
  character?: CollectionCard;
  upload_time?: string;
}

export interface ProfileSlot<T = MaimaiProfileCard | ChunithmProfileCard> {
  state: FriendGameState;
  profile?: T;
}

export interface FriendGames {
  maimai: ProfileSlot<MaimaiProfileCard>;
  chunithm: ProfileSlot<ChunithmProfileCard>;
}

export interface FriendItem {
  user_id: number;
  username: string;
  remark: string;
  is_favorite: boolean;
  friends_since: string;
  games: FriendGames;
}

export interface FriendsListResponse {
  friends: FriendItem[];
}

export interface SocialUser {
  id: number;
  username: string;
}

export interface FriendRequestItem {
  id: number;
  direction?: "incoming" | "outgoing";
  user: SocialUser;
  status?: string;
  create_time: string;
  /** 申请人的基本资料，只随「收到的申请」下发，便于辨认对方。 */
  games?: FriendGames;
}

export interface FriendRequestCounts {
  incoming: number;
  outgoing: number;
}

export interface FriendRequestsResponse {
  requests: FriendRequestItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 当前账号与另一账号的关系；拉黑了当前账号的用户按「不存在」处理，不会出现在这里。 */
export type FriendRelationshipStatus =
  | "self"
  | "friend"
  | "outgoing"
  | "incoming"
  | "blocked"
  | "none";

export interface FriendRelationship {
  user_id: number;
  /** 大小写以账号实际用户名为准。 */
  username: string;
  status: FriendRelationshipStatus;
  /** 仅 `outgoing` 与 `incoming` 携带，可直接用于撤回、同意或拒绝。 */
  request_id?: number;
  games: FriendGames;
  remark: string;
  is_favorite: boolean;
  friends_since?: string;
}

export interface BlockedUserItem {
  user_id: number;
  username: string;
  create_time: string;
}

export interface BlockedUsersResponse {
  blocks: BlockedUserItem[];
  total: number;
  page: number;
  page_size: number;
}
