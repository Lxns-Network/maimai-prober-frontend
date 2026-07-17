import {
  clearAuthSessionForIdentity,
  getAuthSessionIdentity,
  getAuthToken,
  isTokenExpired,
  isTokenUndefined,
  setRefreshedAuthToken,
} from "@/utils/session.ts";
import { APIError } from "@/utils/errors.ts";
import { getTokenSessionIdentity } from "@/utils/sessionCore.ts";

export const API_URL = import.meta.env.VITE_API_URL;

export class TokenRefreshError extends APIError {
  authenticationFailure: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: number; authenticationFailure?: boolean } = {},
  ) {
    super(message, options);
    this.name = "TokenRefreshError";
    this.authenticationFailure = options.authenticationFailure ?? false;
  }
}

export const isAuthenticationRefreshError = (error: unknown) =>
  error instanceof TokenRefreshError && error.authenticationFailure;

const refreshPromises = new Map<string, Promise<{ token: string }>>();

async function requestTokenRefresh(
  currentToken: string,
  expectedIdentity: string,
): Promise<{ token: string }> {
  try {
    const response = await fetch(`${API_URL}/user/refresh`, {
      method: "GET",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      },
    });

    let data: {
      success?: boolean;
      message?: string;
      code?: number;
      data?: { token?: unknown };
    };
    const authenticationFailure = response.status === 401 || response.status === 403;
    try {
      data = await response.json();
    } catch {
      if (authenticationFailure) {
        const cleared = await clearAuthSessionForIdentity(expectedIdentity);
        if (!cleared) throw new TokenRefreshError("登录会话已变更，请重试");
        throw new TokenRefreshError("登录会话已失效", {
          status: response.status,
          authenticationFailure: true,
        });
      }
      throw new TokenRefreshError("服务器返回了无效的响应", { status: response.status });
    }

    if (authenticationFailure) {
      const cleared = await clearAuthSessionForIdentity(expectedIdentity);
      if (!cleared) throw new TokenRefreshError("登录会话已变更，请重试");
      throw new TokenRefreshError(data.message || "登录会话已失效", {
        status: response.status,
        code: data.code,
        authenticationFailure: true,
      });
    }

    if (!response.ok || data.success === false) {
      throw new TokenRefreshError(data.message || "刷新登录会话失败", {
        status: response.status,
        code: data.code,
      });
    }

    if (typeof data.data?.token !== "string" || !data.data.token) {
      throw new TokenRefreshError("服务器未返回有效的登录令牌", { status: response.status });
    }

    const stored = await setRefreshedAuthToken(data.data.token, expectedIdentity);
    if (!stored) throw new TokenRefreshError("登录会话已变更，请重试");
    return { token: data.data.token };
  } catch (error) {
    if (error instanceof TokenRefreshError) throw error;
    throw new TokenRefreshError("暂时无法连接服务器以验证登录状态");
  }
}

/**
 * Refreshes the current bearer token through the single shared in-flight request.
 * Authentication failures clear the session; network and server failures preserve it for retry.
 */
export async function refreshAuthToken() {
  const currentToken = getAuthToken();
  const identity = getTokenSessionIdentity(currentToken);
  if (!currentToken || !identity) {
    throw new TokenRefreshError("登录会话不存在", {
      status: 401,
      authenticationFailure: true,
    });
  }

  const inFlight = refreshPromises.get(identity);
  if (inFlight) return inFlight;

  const refresh = requestTokenRefresh(currentToken, identity).finally(() => {
    if (refreshPromises.get(identity) === refresh) refreshPromises.delete(identity);
  });
  refreshPromises.set(identity, refresh);
  return refresh;
}

async function ensureTokenValid() {
  if (!isTokenUndefined() && isTokenExpired()) {
    await refreshAuthToken();
  }
}

type RequestAuthMode = "required" | "optional" | "none";

const getDefaultAuthMode = (endpoint: string): RequestAuthMode =>
  endpoint === "user" || endpoint.startsWith("user/") ? "required" : "optional";

const createRequestHeaders = (headers?: Record<string, string>, token?: string | null) => {
  const requestHeaders = new Headers({
    "Content-Type": "application/json",
    ...headers,
  });
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  return requestHeaders;
};

async function retryAfterUnauthorized(
  request: (token: string | null) => Promise<Response>,
  requestToken: string,
) {
  const requestIdentity = getTokenSessionIdentity(requestToken);
  const response = await request(requestToken);
  if (response.status !== 401 || !requestIdentity) return response;
  if (getAuthSessionIdentity() !== requestIdentity) return response;

  await refreshAuthToken();
  const retryToken = getAuthToken();
  if (getTokenSessionIdentity(retryToken) !== requestIdentity) return response;

  const retriedResponse = await request(retryToken);
  if (retriedResponse.status === 401) {
    await clearAuthSessionForIdentity(requestIdentity);
  }
  return retriedResponse;
}

export async function fetchAPI(
  endpoint: string,
  options: {
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
    auth?: RequestAuthMode;
  },
): Promise<Response> {
  const { method = "GET", body, headers, auth = getDefaultAuthMode(endpoint) } = options;
  const requestBody =
    body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  const request = (token: string | null) =>
    fetch(`${API_URL}/${endpoint}`, {
      method,
      credentials: "include",
      headers: createRequestHeaders(headers, token),
      body: requestBody,
    });

  if (auth === "none") return request(null);

  if (auth === "optional") {
    const currentToken = getAuthToken();
    const requestToken = currentToken && !isTokenExpired() ? currentToken : null;
    const response = await request(requestToken);
    return response.status === 401 && requestToken ? request(null) : response;
  }

  if (endpoint === "user/refresh") return request(getAuthToken());

  await ensureTokenValid();
  const requestToken = getAuthToken();
  if (!requestToken) return request(null);
  return retryAfterUnauthorized(request, requestToken);
}

export async function uploadFile(endpoint: string, file: File): Promise<Response> {
  await ensureTokenValid();

  const request = (token: string | null) => {
    const formData = new FormData();
    formData.append("file", file);
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(`${API_URL}/${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: formData,
    });
  };

  const requestToken = getAuthToken();
  if (!requestToken) return request(null);
  return retryAfterUnauthorized(request, requestToken);
}
