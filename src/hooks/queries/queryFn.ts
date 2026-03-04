import { QueryFunctionContext } from "@tanstack/react-query";
import { fetchAPI } from "@/utils/api/api.ts";
import { APIError } from "@/utils/errors.ts";
import { ApiResponse } from "@/types/api";

async function parseJSON<T>(res: Response): Promise<T> {
  try {
    return await res.json();
  } catch {
    throw new APIError("服务器返回了无效的响应", { status: res.status });
  }
}

// 用于返回 { success, data } 包装格式的 API 端点（大部分 /user/* 端点）
export const defaultQueryFn = async ({ queryKey }: QueryFunctionContext) => {
  const url = queryKey[0] as string;
  const res = await fetchAPI(url, { method: "GET" });
  const data = await parseJSON<ApiResponse<any>>(res);
  if (!data.success) {
    throw new APIError(data.message, { status: res.status, code: data.code });
  }
  return data.data;
};

// 用于直接返回数据的 API 端点（如公开的 /{game}/song/* 端点），通过 HTTP 状态码判断错误
export const resourceQueryFn = async ({ queryKey }: QueryFunctionContext) => {
  const url = queryKey[0] as string;
  const res = await fetchAPI(url, { method: "GET" });
  const data = await parseJSON<any>(res);
  if (!res.ok) {
    const error = data as ApiResponse;
    throw new APIError(error.message, { status: res.status, code: error.code });
  }
  return data;
};
