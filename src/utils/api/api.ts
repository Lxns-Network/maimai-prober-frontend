import { isTokenExpired, isTokenUndefined } from "../session";
import { refreshToken } from "./user.ts";

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
}
