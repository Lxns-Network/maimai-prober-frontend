import {
  decodeLoginSessionPayload,
  getTokenSessionIdentity,
  isTokenSessionExpired,
  parseStoredGame,
  resolveSameOriginRedirect,
  type SupportedGame,
} from "./sessionCore.ts";

const isBrowser = () => typeof window !== "undefined";
type AuthSessionChangeHandler = (phase: "cancel" | "remove") => void | Promise<void>;

let authSessionChangeHandler: AuthSessionChangeHandler | null = null;
const authSessionListeners = new Set<() => void>();
let authSessionUpdate: Promise<unknown> = Promise.resolve();

export const getAuthToken = () => (isBrowser() ? localStorage.getItem("token") : null);
export const getAuthSessionIdentity = () => getTokenSessionIdentity(getAuthToken());

export const subscribeAuthSession = (listener: () => void) => {
  authSessionListeners.add(listener);
  return () => authSessionListeners.delete(listener);
};

export const registerAuthSessionChangeHandler = (handler: AuthSessionChangeHandler) => {
  authSessionChangeHandler = handler;
};

const notifyAuthSessionListeners = () => {
  for (const listener of authSessionListeners) listener();
};

const enqueueAuthSessionUpdate = <T>(update: () => Promise<T>): Promise<T> => {
  const pendingUpdate = authSessionUpdate.then(update, update);
  authSessionUpdate = pendingUpdate.catch(() => undefined);
  return pendingUpdate;
};

const handleAuthStorageChange = (event: StorageEvent) => {
  if (event.key !== "token" && event.key !== null) return;

  void enqueueAuthSessionUpdate(async () => {
    const identityChanged =
      event.key === null ||
      getTokenSessionIdentity(event.oldValue) !== getTokenSessionIdentity(event.newValue);
    if (identityChanged) await authSessionChangeHandler?.("cancel");
    if (identityChanged) await authSessionChangeHandler?.("remove");
    notifyAuthSessionListeners();
  });
};

if (isBrowser()) window.addEventListener("storage", handleAuthStorageChange);

/**
 * Stores a bearer token and clears cached user data before notifying account-switch subscribers.
 */
const storeAuthToken = (token: string, expectedIdentity?: string) =>
  enqueueAuthSessionUpdate(async () => {
    if (!isBrowser()) return false;

    const previousToken = localStorage.getItem("token");
    if (
      expectedIdentity !== undefined &&
      getTokenSessionIdentity(previousToken) !== expectedIdentity
    ) {
      return false;
    }

    const identityChanged =
      getTokenSessionIdentity(previousToken) !== getTokenSessionIdentity(token);

    if (identityChanged) await authSessionChangeHandler?.("cancel");

    localStorage.setItem("token", token);
    if (identityChanged) await authSessionChangeHandler?.("remove");
    notifyAuthSessionListeners();
    return true;
  });

export const setAuthToken = (token: string) => storeAuthToken(token);

/** Stores a refreshed token only if the browser is still signed in to the originating account. */
export const setRefreshedAuthToken = (token: string, expectedIdentity: string) =>
  storeAuthToken(token, expectedIdentity);

/**
 * Removes the local bearer token and clears all cached data scoped to the signed-in user.
 */
const removeAuthToken = (expectedIdentity?: string) =>
  enqueueAuthSessionUpdate(async () => {
    if (!isBrowser()) return false;

    const currentToken = localStorage.getItem("token");
    if (
      expectedIdentity !== undefined &&
      getTokenSessionIdentity(currentToken) !== expectedIdentity
    ) {
      return false;
    }

    const hadToken = currentToken !== null;
    if (hadToken) await authSessionChangeHandler?.("cancel");
    localStorage.removeItem("token");
    if (hadToken) await authSessionChangeHandler?.("remove");
    notifyAuthSessionListeners();
    return true;
  });

export const clearAuthSession = () => removeAuthToken();

/** Clears a failed session only if no account switch occurred while the request was in flight. */
export const clearAuthSessionForIdentity = (expectedIdentity: string) =>
  removeAuthToken(expectedIdentity);

const getLoginSessionPayload = () => {
  return decodeLoginSessionPayload(getAuthToken());
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
    username: payload.name as string,
    permission: payload.permission as number,
  };
};

export const isTokenExpired = () => {
  return isTokenSessionExpired(getAuthToken());
};

export const isTokenUndefined = () => {
  return !getAuthToken();
};

export const isTokenValid = () => {
  return !isTokenExpired();
};

/**
 * Clears the local session without making a server request. Interactive logout should call the
 * logout endpoint first, then clear locally even if that request fails.
 */
export const logout = () => {
  void clearAuthSession();
};

export enum UserPermission {
  User = 1 << 0,
  Developer = 1 << 1,
  Administrator = 1 << 2,
}

export const checkPermission = (permission: UserPermission) => {
  const payload = getLoginSessionPayload();
  return typeof payload?.permission === "number" && (payload.permission & permission) !== 0;
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
  const safeRedirect = resolveSameOriginRedirect(
    redirect,
    isBrowser() ? window.location.origin : "http://localhost",
  );
  if (safeRedirect) return safeRedirect;

  try {
    const game = readStoredGame();
    const token = getAuthToken();
    const apiUrl = import.meta.env.VITE_API_URL;
    const res = await fetch(`${apiUrl}/user/${game}/player`, {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      credentials: "include",
    });
    if (res.status === 404) return "/user/sync";
    if (!res.ok) return "/";

    const data = (await res.json()) as { success?: boolean; data?: unknown };
    return data.success && data.data ? "/" : "/user/sync";
  } catch {
    return "/";
  }
};

export const readStoredGame = (fallback: SupportedGame = "maimai") =>
  parseStoredGame(isBrowser() ? localStorage.getItem("game") : null, fallback);
