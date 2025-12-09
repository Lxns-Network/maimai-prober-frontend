import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import { mutate } from "swr";

export const API_URL = import.meta.env.VITE_API_URL;

let refreshPromise: Promise<void> | null = null;

export async function fetchAPI(endpoint: string, options: { method: string, body?: unknown, headers?: Record<string, string> }) {
  // 如果 token 过期且不是刷新请求，先等待 token 刷新完成
  if (!isTokenUndefined() && isTokenExpired() && endpoint !== "user/refresh") {
    if (!refreshPromise) {
      refreshPromise = refreshToken();
    }
    await refreshPromise;
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
      // 通知 SWR 缓存更新
      await mutate("user/refresh", data.data, false);
    }
  } finally {
    // 重置刷新 Promise，允许下次刷新
    refreshPromise = null;
  }
}

export async function uploadFile(endpoint: string, file: File) {
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