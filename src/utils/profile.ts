export const profilePath = (username: string) => `/profile/${encodeURIComponent(username)}`;

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
