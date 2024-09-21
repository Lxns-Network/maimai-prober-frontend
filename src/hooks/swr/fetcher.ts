import { fetchAPI } from "@/utils/api/api.ts";

export const fetcher = async (url: string) => {
  const res = await fetchAPI(url, { method: "GET" });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.data;
}