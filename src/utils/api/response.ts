import { APIError } from "@/utils/errors.ts";
import { ApiResponse } from "@/types/api";

/** 消费响应正文；JSON 无效或 HTTP 失败时抛出 APIError，保留请求取消错误。 */
export async function parseJSONResponse<T>(response: Response): Promise<T> {
  let data: T;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new APIError("服务器返回了无效的响应", { status: response.status });
  }
  if (!response.ok) {
    const error = data as ApiResponse;
    throw new APIError(error?.message, { status: response.status, code: error?.code });
  }
  return data;
}

/** 消费并解包 { success, data } 响应；HTTP、JSON 或业务错误会抛出 APIError。 */
export async function parseAPIResponse<T = unknown>(response: Response): Promise<T> {
  const data = await parseJSONResponse<ApiResponse<T>>(response);
  if (!data?.success) {
    throw new APIError(data?.message, { status: response.status, code: data?.code });
  }
  return data.data;
}
