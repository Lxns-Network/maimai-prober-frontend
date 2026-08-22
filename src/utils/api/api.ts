import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import { queryClient } from "@/lib/queryClient.ts";
import { APIError } from "@/utils/errors.ts";
import { ApiResponse } from "@/types/api";

export const API_URL = import.meta.env.VITE_API_URL;

interface RefreshTokenData {
  token: string;
}

const REFRESH_RETRY_DELAYS = [300, 1000];
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;

let refreshPromise: Promise<RefreshTokenData> | null = null;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

async function getRefreshError(response: Response): Promise<APIError> {
  try {
    const data = (await response.json()) as Partial<ApiResponse>;
    return new APIError(data.message || "登录状态刷新失败", {
      code: data.code,
      status: response.status,
    });
  } catch {
    return new APIError("登录状态刷新失败", { status: response.status });
  }
}

async function requestTokenRefresh(): Promise<RefreshTokenData> {
  let lastError: APIError | null = null;

  for (let attempt = 0; attempt <= REFRESH_RETRY_DELAYS.length; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(`${API_URL}/user/refresh`, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      lastError = new APIError("网络连接异常，请稍后重试");

      if (attempt < REFRESH_RETRY_DELAYS.length) {
        await delay(REFRESH_RETRY_DELAYS[attempt]);
        continue;
      }

      throw lastError;
    }

    if (!response.ok) {
      const error = await getRefreshError(response);

      const canRetry = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!canRetry) {
        // 非瞬时失败（401/403/400 等）说明 token 已不可用：清掉过期 token，
        // 让 useUserToken/Layout 走会话过期流程引导重新登录，避免卡死在坏 token 上。
        localStorage.removeItem("token");
        throw error;
      }
      if (attempt === REFRESH_RETRY_DELAYS.length) {
        throw error;
      }

      lastError = error;
      await delay(REFRESH_RETRY_DELAYS[attempt]);
      continue;
    }

    let data: ApiResponse<RefreshTokenData>;
    try {
      data = (await response.json()) as ApiResponse<RefreshTokenData>;
    } catch {
      lastError = new APIError("服务器返回了无效的响应", { status: response.status });

      if (attempt < REFRESH_RETRY_DELAYS.length) {
        await delay(REFRESH_RETRY_DELAYS[attempt]);
        continue;
      }

      throw lastError;
    }

    if (!data.success || !data.data?.token) {
      // 业务层明确拒绝不是瞬时错误，不重试；同样视为 token 失效。
      localStorage.removeItem("token");
      throw new APIError(data.message || "服务器返回了无效的响应", {
        code: data.code,
        status: response.status,
      });
    }

    localStorage.setItem("token", data.data.token);
    queryClient.setQueryData(["user/refresh"], data.data);
    return data.data;
  }

  throw lastError || new APIError("登录状态刷新失败");
}

export function refreshAccessToken(): Promise<RefreshTokenData> {
  if (!refreshPromise) {
    refreshPromise = requestTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function ensureTokenValid() {
  if (!isTokenUndefined() && isTokenExpired(TOKEN_REFRESH_BUFFER_MS)) {
    await refreshAccessToken();
  }
}

export async function fetchAPI(
  endpoint: string,
  options: { method: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
  // 登出与刷新本身不做预检刷新：刷新持续失败时登出必须仍然可达，否则用户会被锁在坏会话里。
  if (endpoint !== "user/refresh" && endpoint !== "user/logout") {
    await ensureTokenValid();
  }

  const { method = "GET", body, headers } = options;

  return await fetch(`${API_URL}/${endpoint}`, {
    method,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export async function uploadFile(endpoint: string, file: File): Promise<Response> {
  await ensureTokenValid();

  const formData = new FormData();
  formData.append("file", file);

  return await fetch(`${API_URL}/${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: formData,
  });
}
