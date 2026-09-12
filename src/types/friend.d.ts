/** 基本资料（昵称、头像、称号、评分）对好友始终可见，因此不存在「未公开」状态。 */
export type FriendGameState = "visible" | "unbound" | "unavailable";

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

export interface GameSlot<T = MaimaiProfileCard | ChunithmProfileCard> {
  state: FriendGameState;
  profile?: T;
  /** 该好友是否允许好友查看自己的谱面成绩。 */
  scores_visible: boolean;
}

export interface FriendGames {
  maimai: GameSlot<MaimaiProfileCard>;
  chunithm: GameSlot<ChunithmProfileCard>;
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
  created_time: string;
}

export interface FriendRequestsResponse {
  requests: FriendRequestItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface BlockedUserItem {
  user_id: number;
  username: string;
  created_time: string;
}

export interface BlockedUsersResponse {
  blocks: BlockedUserItem[];
  total: number;
  page: number;
  page_size: number;
}
