import { logoutUser } from "./api/user";

export const isTokenExpired = () => {
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
  const token = localStorage.getItem('token');
  return !token;
}

export const isTokenValid = () => {
  return !isTokenExpired();
}

export const logout = () => {
  logoutUser().then(() => {
    localStorage.removeItem('token');
  });
}

export enum UserPermission {
  User = 1 << 0,
  Developer = 1 << 1,
  Administrator = 1 << 2,
}

export const checkPermission = (permission: UserPermission) => {
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