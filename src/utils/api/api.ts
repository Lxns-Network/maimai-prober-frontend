import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import { queryClient } from "@/lib/queryClient.ts";

export const API_URL = import.meta.env.VITE_API_URL;

let refreshPromise: Promise<void> | null = null;

async function refreshToken() {
  try {
    const response = await fetch(`${API_URL}/user/refresh`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("token", data.data.token);
      // 通知 TanStack Query 缓存更新
      queryClient.setQueryData(["user/refresh"], data.data);
    } else {
      // 刷新失败，清除过期 token，后续请求将由全局错误处理引导登录
      localStorage.removeItem("token");
    }
  } finally {
    // 重置刷新 Promise，允许下次刷新
    refreshPromise = null;
  }
}

async function ensureTokenValid() {
  if (!isTokenUndefined() && isTokenExpired()) {
    if (!refreshPromise) {
      refreshPromise = refreshToken();
    }
    await refreshPromise;
  }
}

export async function fetchAPI(endpoint: string, options: { method: string, body?: unknown, headers?: Record<string, string> }): Promise<Response> {
  if (endpoint !== "user/refresh") {
    await ensureTokenValid();
  }

  const { method = "GET", body, headers } = options;

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

export async function uploadFile(endpoint: string, file: File): Promise<Response> {
  await ensureTokenValid();

  const formData = new FormData();
  formData.append("file", file);

  return await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("token")}`,
    },
    body: formData,
  });
}
