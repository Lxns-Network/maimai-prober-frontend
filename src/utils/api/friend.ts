import { APIError } from "@/utils/errors.ts";
import { fetchAPI } from "./api.ts";

export const MAX_FRIENDS = 200;
export const MAX_OUTGOING_FRIEND_REQUESTS = 20;

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
  "user not found": "找不到该用户",
  "cannot add self as friend": "不能向自己发送好友申请",
  "already friends": "你们已经是好友了",
  "friend request already pending": "已发送过好友申请，请等待对方处理",
  "friend request cooldown": "对方近期拒绝过申请，7 天内无法再次发送",
  "friend request limit reached": `待处理的好友申请已达上限（${MAX_OUTGOING_FRIEND_REQUESTS} 个）`,
  "friend limit reached": `好友数量已达上限（${MAX_FRIENDS} 人）`,
  "friend request not found": "好友申请不存在或已被处理",
  "friend request state conflict": "好友申请状态已改变，请刷新后重试",
  "friend not found": "好友不存在或已解除好友关系",
  "user is blocked": "对方在你的黑名单中，请先解除拉黑",
  "user block not found": "该用户不在黑名单中",
  "remark is too long": "备注长度不能超过 64 个字符",
  "remark contains control characters": "备注不能包含控制字符",
  "remark or is_favorite is required": "请提供要修改的备注或特别关注状态",
  "avatar is too large": "头像不能超过 5 MB",
  "unsupported avatar format": "头像只支持 JPG、PNG 或 WebP",
  "avatar upload limit reached": "头像每天最多上传 3 次",
  "avatar audit failed": "头像未通过审核，请更换图片后重试",
  "internal server error": "服务器繁忙，请稍后重试",
};

/** 只翻译接口返回的错误；断网等非 `APIError` 的原始报错不适合展示，统一使用 `fallback`。 */
export function getFriendErrorMessage(error: unknown, fallback = "操作失败，请重试"): string {
  if (!(error instanceof APIError)) return fallback;
  return FRIEND_ERROR_MAPPINGS[error.message] ?? (error.message || fallback);
}

/** 好友相关数据加载失败时的说明文案。 */
export const getFriendLoadErrorMessage = (error: unknown) =>
  getFriendErrorMessage(error, "请检查网络连接后重试");
