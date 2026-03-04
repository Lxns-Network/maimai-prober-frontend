import { APIError } from "@/utils/errors.ts";
import { ApiResponse } from "@/types/api";

export async function apiMutationFn<T = unknown>(
  apiFn: () => Promise<Response>
): Promise<T> {
  const res = await apiFn();
  let data: ApiResponse<T>;
  try {
    data = await res.json();
  } catch {
    throw new APIError("服务器返回了无效的响应", { status: res.status });
  }
  if (!data.success) {
    throw new APIError(data.message, { code: data.code, status: res.status });
  }
  return data.data;
}
