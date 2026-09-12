import { fetchAPI } from "./api.ts";

export async function updateFriendPreference(
  userId: number,
  data: { remark?: string; is_favorite?: boolean },
): Promise<Response> {
  return fetchAPI(`user/friends/${userId}`, {
    method: "PATCH",
    body: data,
  });
}

export async function deleteFriend(userId: number): Promise<Response> {
  return fetchAPI(`user/friends/${userId}`, {
    method: "DELETE",
  });
}

export async function createFriendRequest(username: string): Promise<Response> {
  return fetchAPI("user/friend-requests", {
    method: "POST",
    body: { username },
  });
}

export async function acceptFriendRequest(requestId: number): Promise<Response> {
  return fetchAPI(`user/friend-requests/${requestId}/accept`, {
    method: "POST",
  });
}

export async function rejectFriendRequest(requestId: number): Promise<Response> {
  return fetchAPI(`user/friend-requests/${requestId}/reject`, {
    method: "POST",
  });
}

export async function withdrawFriendRequest(requestId: number): Promise<Response> {
  return fetchAPI(`user/friend-requests/${requestId}`, {
    method: "DELETE",
  });
}

export async function blockUser(userId: number): Promise<Response> {
  return fetchAPI(`user/blocks/${userId}`, {
    method: "POST",
  });
}

export async function unblockUser(userId: number): Promise<Response> {
  return fetchAPI(`user/blocks/${userId}`, {
    method: "DELETE",
  });
}

const FRIEND_ERROR_MAPPINGS: Record<string, string> = {
  "user not found": "找不到该用户，请检查用户名是否正确",
  "cannot add self as friend": "不能向自己发送好友申请",
  "already friends": "你们双方已经是好友了",
  "friend request already pending": "已向该用户发送过申请，请等待对方同意",
  "friend request cooldown": "申请被拒绝，7天冷却期内无法再次向该用户发送申请",
  "friend request limit reached": "发出的待处理好友申请已达上限（最多 20 个）",
  "friend limit reached": "好友数量已达上限（最多 200 人）",
  "friend request not found": "好友申请不存在或已被处理",
  "friend request state conflict": "好友申请状态已改变，请刷新后重试",
  "friend not found": "好友不存在或已解除好友关系",
  "user is blocked": "对方在你的黑名单中，无法发送好友申请",
  "user block not found": "该用户不在黑名单中",
  "remark is too long": "备注长度不能超过 64 个字符",
  "remark or is_favorite is required": "请提供要修改的备注或特别关注状态",
};

export function getFriendErrorMessage(error: unknown, fallback = "操作失败，请重试"): string {
  if (!(error instanceof Error)) return fallback;
  return FRIEND_ERROR_MAPPINGS[error.message] ?? (error.message || fallback);
}
