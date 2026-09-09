const isBrowser = () => typeof window !== "undefined";
const SESSION_EXPIRED_KEY = "session_expired";

let isRedirectingExpiredSession = false;

const storeSessionExpired = () => {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  } catch {
    return;
  }
};

/** Clears the local session and reloads the login page with a one-time expiry notice. */
export const redirectExpiredSessionToLogin = () => {
  if (!isBrowser() || isRedirectingExpiredSession) return;

  isRedirectingExpiredSession = true;
  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  localStorage.removeItem("token");
  storeSessionExpired();

  if (window.location.pathname === "/login") {
    window.location.reload();
    return;
  }

  window.location.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
};

/** Returns whether the login page should show the session-expired notice, consuming the flag. */
export const consumeSessionExpired = () => {
  if (!isBrowser()) return false;

  try {
    const expired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return expired;
  } catch {
    return false;
  }
};

interface LoginSessionPayload {
  id: number;
  name: string;
  permission: number;
  exp: number;
}

/** 本地存储不可访问时视为未登录。 */
export const getAccessToken = (): string | null => {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

const getLoginSessionPayload = (): LoginSessionPayload | null => {
  const token = getAccessToken();
  if (!token) {
    return null;
  }

  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !payload ||
      !Number.isSafeInteger(payload.id) ||
      typeof payload.name !== "string" ||
      !Number.isSafeInteger(payload.permission) ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const getLoginUserId = () => {
  const payload = getLoginSessionPayload();
  return payload ? payload.id : null;
};

export const getSentryUser = () => {
  const payload = getLoginSessionPayload();
  if (!payload) return null;
  return {
    id: String(payload.id),
    username: payload.name,
    permission: payload.permission,
  };
};

export const isTokenExpired = (bufferMs = 0) => {
  const payload = getLoginSessionPayload();
  return !payload || Date.now() + bufferMs >= payload.exp * 1000;
};

export const isTokenUndefined = () => {
  return !getAccessToken();
};

export enum UserPermission {
  User = 1 << 0,
  Developer = 1 << 1,
  Administrator = 1 << 2,
}

export const checkPermission = (permission: UserPermission) => {
  const payload = getLoginSessionPayload();
  return payload !== null && (payload.permission & permission) !== 0;
};

export const permissionToList = (permission: number) => {
  const list = [];
  if ((permission & UserPermission.User) !== 0) {
    list.push(UserPermission.User);
  }
  if ((permission & UserPermission.Developer) !== 0) {
    list.push(UserPermission.Developer);
  }
  if ((permission & UserPermission.Administrator) !== 0) {
    list.push(UserPermission.Administrator);
  }
  return list;
};

export const listToPermission = (list: UserPermission[]) => {
  let permission = 0;
  for (const item of list) {
    permission |= item;
  }
  return permission;
};

export const resolvePostLoginTarget = async (redirect?: string | null): Promise<string> => {
  const EXCLUDED = ["/login", "/register"];
  if (redirect?.startsWith("/") && isBrowser()) {
    try {
      const target = new URL(redirect, window.location.origin);
      if (
        target.origin === window.location.origin &&
        !target.pathname.startsWith("//") &&
        !EXCLUDED.includes(target.pathname.replace(/\/+$/, ""))
      ) {
        return target.pathname + target.search + target.hash;
      }
    } catch {
      // 无效的 URL 使用默认登录后页面。
    }
  }

  let game = "maimai";
  try {
    const storedGame: unknown = JSON.parse((isBrowser() && localStorage.getItem("game")) || "null");
    if (storedGame === "maimai" || storedGame === "chunithm") game = storedGame;
  } catch {
    game = "maimai";
  }

  try {
    const token = getAccessToken();
    const apiUrl = import.meta.env.VITE_API_URL;
    const res = await fetch(`${apiUrl}/user/${game}/player`, {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      credentials: "include",
    });
    const data = await res.json();
    if (res.ok && data.success && data.data) {
      return "/";
    }
  } catch {
    // 网络错误时仍允许进入同步页面。
  }

  return "/user/sync";
};
