import {isTokenExpired, isTokenUndefined} from "../session";

export const API_URL = import.meta.env.VITE_API_URL;

export async function fetchAPI(endpoint: string, options: { method: string, body?: any, headers?: any }) {
  const { method = "GET", body, headers } = options;

  if (!isTokenUndefined() && isTokenExpired() && endpoint !== "user/refresh") {
    // 如果请求 API 时 token 过期则尝试刷新 token
    try {
      await refreshToken();
    } catch (error) {
      // 刷新 token 失败则刷新页面，使用 App.tsx 中的 useEffect 刷新 token
      window.location.reload();
    }
  }

  try {
    return await fetch(`${API_URL}/${endpoint}`, {
      method,
      credentials: "include",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (error) {
    return null;
  }
}

export function refreshToken() {
  return new Promise((resolve, reject) => {
    fetchAPI("user/refresh", { method: "GET" })
      .then(res => res?.json())
      .then(data => {
        if (data?.code === 200) {
          localStorage.setItem("token", data.data.token);
          resolve(true);
        } else {
          reject(false);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}

export async function getProfile() {
  return fetchAPI("user/profile", { method: "GET" });
}

export async function getPlayerDetail() {
  return fetchAPI("user/player", { method: "GET" });
}

export async function getPlayerScores() {
  return fetchAPI("user/player/scores", { method: "GET" });
}

export async function getUserConfig() {
  return fetchAPI("user/config", { method: "GET" });
}

export async function updateUserConfig(data: any) {
  return fetchAPI("user/config", { method: "POST", body: data });
}

export async function sendDeveloperApply(data: any, recaptcha: any) {
  return fetchAPI(`user/developer/apply?recaptcha=${recaptcha}`, { method: "POST", body: data });
}

export async function getDeveloperApply() {
  return fetchAPI("user/developer/apply", { method: "GET" });
}

export async function getUsers() {
  return fetchAPI("user/admin/users", { method: "GET" });
}

export async function updateUser(data: any) {
  return fetchAPI("user/admin/user", { method: "POST", body: data });
}

export async function deleteUser(data: any) {
  return fetchAPI("user/admin/user", { method: "DELETE", body: data });
}