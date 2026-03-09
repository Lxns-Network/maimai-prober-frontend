import { logoutUser } from "./api/user.ts";

const isBrowser = () => typeof window !== 'undefined';

const getLoginSessionPayload = () => {
  if (!isBrowser()) return null;
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }

  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (error) {
    return null;
  }
}

export const getLoginUserId = () => {
  const payload = getLoginSessionPayload();
  return payload ? payload.id : null;
}

export const getSentryUser = () => {
  const payload = getLoginSessionPayload();
  if (!payload) return null;
  return {
    id: String(payload.id),
    username: payload.name as string,
    permission: payload.permission as number,
  };
}

export const isTokenExpired = () => {
  if (!isBrowser()) return true;
  const token = localStorage.getItem('token');
  if (!token) {
    return true;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now();
    const expirationTime = payload.exp * 1000;

    if (isNaN(expirationTime)) {
      return true;
    }

    return currentTime > expirationTime;
  } catch (error) {
    return true;
  }
};

export const isTokenUndefined = () => {
  if (!isBrowser()) return true;
  const token = localStorage.getItem('token');
  return !token;
}

export const isTokenValid = () => {
  return !isTokenExpired();
}

export const logout = () => {
  if (!isBrowser()) return;
  localStorage.removeItem('token');
  logoutUser();
}

export enum UserPermission {
  User = 1 << 0,
  Developer = 1 << 1,
  Administrator = 1 << 2,
}

export const checkPermission = (permission: UserPermission) => {
  if (!isBrowser()) return false;
  const token = localStorage.getItem('token');
  if (!token) {
    return false;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.permission & permission) !== 0;
  } catch (error) {
    return false;
  }
}

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
}

export const listToPermission = (list: UserPermission[]) => {
  let permission = 0;
  for (const item of list) {
    permission |= item;
  }
  return permission;
}

export const resolvePostLoginTarget = async (redirect?: string | null): Promise<string> => {
  const EXCLUDED = ['/login', '/register'];
  if (redirect && !EXCLUDED.includes(redirect)) {
    return redirect;
  }

  try {
    const game = (isBrowser() && localStorage.getItem('game')) || 'maimai';
    const token = isBrowser() ? localStorage.getItem('token') : null;
    const apiUrl = import.meta.env.VITE_API_URL;
    const res = await fetch(`${apiUrl}/user/${game}/player`, {
      method: 'GET',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success && data.data) {
      return '/';
    }
  } catch {
    // 网络错误时不阻断登录流程，直接跳首页
  }

  return '/user/sync';
};
