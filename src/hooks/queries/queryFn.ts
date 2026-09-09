import { QueryFunctionContext } from "@tanstack/react-query";
import { fetchAPI } from "@/utils/api/api.ts";
import { parseAPIResponse, parseJSONResponse } from "@/utils/api/response.ts";

/** 解包 { success, data } 响应；HTTP 或业务错误会抛出 APIError。 */
export const defaultQueryFn = async <T = unknown>({
  queryKey,
  signal,
}: QueryFunctionContext): Promise<T> => {
  const url = queryKey[0] as string;
  const res = await fetchAPI(url, { method: "GET", signal });
  return parseAPIResponse<T>(res);
};

/** 读取未包装的资源响应；HTTP 错误会抛出 APIError。 */
export const resourceQueryFn = async <T = unknown>({
  queryKey,
  signal,
}: QueryFunctionContext): Promise<T> => {
  const url = queryKey[0] as string;
  const res = await fetchAPI(url, { method: "GET", signal });
  return parseJSONResponse<T>(res);
};
